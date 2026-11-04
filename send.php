<?php
declare(strict_types=1);

date_default_timezone_set('Europe/Moscow');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

/**
 * Укажите e-mail, если хотите получать уведомления о заявках.
 * Например: $notifyEmail = 'natalya@example.ru';
 * Если оставить пустым, заявки всё равно сохранятся в storage/.requests.jsonl.
 */
$notifyEmail = '';

$storageDir = __DIR__ . '/storage';
$uploadsDir = __DIR__ . '/uploads';
$maxPhotoSize = 8 * 1024 * 1024;

function respond(bool $ok, string $message, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function textLength(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }
    $count = preg_match_all('/./us', $value, $matches);
    return $count === false ? strlen($value) : $count;
}

function textSlice(string $value, int $limit): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $limit, 'UTF-8');
    }
    $characters = preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY);
    if ($characters === false) {
        return substr($value, 0, $limit);
    }
    return implode('', array_slice($characters, 0, $limit));
}

function postString(string $key, int $limit = 500): string
{
    if (!isset($_POST[$key]) || !is_string($_POST[$key])) {
        return '';
    }
    $value = trim($_POST[$key]);
    $value = (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value);
    return textSlice($value, $limit);
}

function normalizedPhone(string $raw): ?string
{
    $digits = preg_replace('/\D+/', '', $raw) ?? '';
    if (strlen($digits) === 11 && $digits[0] === '8') {
        $digits = '7' . substr($digits, 1);
    } elseif (strlen($digits) === 10 && $digits[0] === '9') {
        $digits = '7' . $digits;
    }
    if (!preg_match('/^7\d{10}$/', $digits)) {
        return null;
    }
    return sprintf(
        '+7 (%s) %s-%s-%s',
        substr($digits, 1, 3),
        substr($digits, 4, 3),
        substr($digits, 7, 2),
        substr($digits, 9, 2)
    );
}

function storePhoto(string $uploadsDir, int $maxSize): ?string
{
    if (!isset($_FILES['photo']) || !is_array($_FILES['photo'])) {
        return null;
    }

    $file = $_FILES['photo'];
    $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($error !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Не удалось загрузить фото. Попробуйте ещё раз.');
    }

    $tmpName = (string) ($file['tmp_name'] ?? '');
    $size = (int) ($file['size'] ?? 0);
    if ($size <= 0 || $size > $maxSize) {
        throw new RuntimeException('Фото должно быть не больше 8 МБ.');
    }
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        throw new RuntimeException('Некорректный файл фотографии.');
    }

    $imageInfo = @getimagesize($tmpName);
    $allowedTypes = [
        IMAGETYPE_JPEG => '.jpg',
        IMAGETYPE_PNG => '.png',
        IMAGETYPE_WEBP => '.webp',
    ];
    if ($imageInfo === false || !isset($allowedTypes[(int) $imageInfo[2]])) {
        throw new RuntimeException('Прикрепите фото в формате JPG, PNG или WebP.');
    }

    if (!is_dir($uploadsDir) && !mkdir($uploadsDir, 0755, true) && !is_dir($uploadsDir)) {
        throw new RuntimeException('Не удалось сохранить фото.');
    }

    $filename = date('Ymd-His') . '-' . bin2hex(random_bytes(5)) . $allowedTypes[(int) $imageInfo[2]];
    $destination = rtrim($uploadsDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $filename;
    if (!move_uploaded_file($tmpName, $destination)) {
        throw new RuntimeException('Не удалось сохранить фото.');
    }

    return 'uploads/' . $filename;
}

function notifyByEmail(string $to, array $record): void
{
    if ($to === '') {
        return;
    }

    $isBooking = $record['type'] === 'booking';
    $subject = $isBooking
        ? 'Новая запись: ' . $record['name'] . ' — ' . $record['date'] . ' ' . $record['time']
        : 'Новый отзыв: ' . $record['name'] . ' — ' . $record['rating'] . '/5';

    $photoNote = 'не прикреплено';
    if (!empty($record['photo'])) {
        $host = preg_replace('/[^a-z0-9.\-:]/i', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $photoNote = $host !== '' ? $scheme . '://' . $host . '/' . $record['photo'] : $record['photo'];
    }

    $lines = $isBooking
        ? [
            'Имя: ' . $record['name'],
            'Телефон: ' . $record['phone'],
            'Услуга: ' . $record['service_label'],
            'Дата: ' . $record['date'],
            'Время: ' . $record['time'],
            'Комментарий: ' . ($record['comment'] !== '' ? $record['comment'] : '—'),
            'Фото: ' . $photoNote,
        ]
        : [
            'Имя: ' . $record['name'],
            'Контакт: ' . ($record['phone'] !== '' ? $record['phone'] : '—'),
            'Оценка: ' . $record['rating'] . ' из 5',
            'Отзыв: ' . $record['message'],
        ];

    $body = implode("\n", $lines) . "\n";
    $headers = "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(false, 'Метод не поддерживается.', 405);
}

if (postString('website', 100) !== '') {
    respond(true, 'Спасибо! Заявка отправлена.');
}

$type = postString('type', 20);
if (!in_array($type, ['booking', 'feedback'], true)) {
    respond(false, 'Неизвестный тип формы.', 422);
}

if (postString('consent', 10) !== '1') {
    respond(false, 'Нужно согласие на обработку персональных данных.', 422);
}

$name = postString('name', 80);
$phoneRaw = postString('phone', 100);
$comment = postString('comment', 800);
$message = postString('message', 2000);

$errors = [];
if (textLength($name) < 2) {
    $errors[] = 'Укажите имя.';
}

$record = [
    'id' => bin2hex(random_bytes(8)),
    'created_at' => (new DateTimeImmutable())->format(DATE_ATOM),
    'type' => $type,
    'name' => $name,
    'ip_hash' => hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '')),
];

$photoPath = null;

try {
    if ($type === 'booking') {
        $phone = normalizedPhone($phoneRaw);
        if ($phone === null) {
            $errors[] = 'Укажите корректный телефон.';
        }

        $services = [
            'haircut' => ['label' => 'Стрижка — 500 ₽', 'price' => 500],
            'haircut_beard' => ['label' => 'Стрижка + борода — 550 ₽', 'price' => 550],
        ];
        $service = postString('service', 40);
        if (!isset($services[$service])) {
            $errors[] = 'Выберите услугу.';
        }

        $date = postString('date', 10);
        $dateObject = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        $dateErrors = DateTimeImmutable::getLastErrors();
        if (
            !$dateObject
            || $dateObject->format('Y-m-d') !== $date
            || ($dateErrors !== false && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0))
        ) {
            $errors[] = 'Выберите корректную дату.';
        } else {
            $today = new DateTimeImmutable('today');
            if ($dateObject < $today) {
                $errors[] = 'Дата уже прошла.';
            } elseif ($dateObject > $today->modify('+90 days')) {
                $errors[] = 'Запись доступна не более чем на 90 дней вперёд.';
            }
        }

        $time = postString('time', 5);
        $timeValid = preg_match('/^(?:1[0-9]|20):(?:00|30)$/', $time) === 1;
        if (!$timeValid) {
            $errors[] = 'Выберите время.';
        }

        if ($dateObject && $dateObject->format('Y-m-d') === (new DateTimeImmutable('today'))->format('Y-m-d') && $timeValid) {
            [$hours, $minutes] = array_map('intval', explode(':', $time));
            $selectedMinutes = $hours * 60 + $minutes;
            $now = new DateTimeImmutable();
            $nowMinutes = (int) $now->format('G') * 60 + (int) $now->format('i');
            if ($selectedMinutes < $nowMinutes + 60) {
                $errors[] = 'На сегодня это время уже недоступно.';
            }
        }

        if ($errors === []) {
            $photoPath = storePhoto($uploadsDir, $maxPhotoSize);
            $record += [
                'phone' => $phone,
                'service' => $service,
                'service_label' => $services[$service]['label'],
                'price' => $services[$service]['price'],
                'date' => $date,
                'time' => $time,
                'comment' => $comment,
                'photo' => $photoPath,
            ];
        }
    } else {
        $contact = postString('phone', 100);
        $rating = (int) postString('rating', 2);
        if ($rating < 1 || $rating > 5) {
            $errors[] = 'Поставьте оценку от 1 до 5.';
        }
        if (textLength($message) < 10) {
            $errors[] = 'Расскажите об отзыве чуть подробнее.';
        }
        if ($errors === []) {
            $record += [
                'phone' => $contact,
                'rating' => $rating,
                'message' => $message,
            ];
        }
    }

    if ($errors !== []) {
        if ($photoPath !== null) {
            @unlink(__DIR__ . '/' . $photoPath);
        }
        respond(false, implode(' ', $errors), 422);
    }

    if (!is_dir($storageDir) && !mkdir($storageDir, 0755, true) && !is_dir($storageDir)) {
        throw new RuntimeException('Не удалось сохранить заявку.');
    }

    $storageFile = $storageDir . '/.requests.jsonl';
    $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    if (file_put_contents($storageFile, $line, FILE_APPEND | LOCK_EX) === false) {
        throw new RuntimeException('Не удалось сохранить заявку.');
    }

    notifyByEmail($notifyEmail, $record);

    if ($type === 'booking') {
        respond(true, 'Заявка отправлена! Наталья перезвонит, чтобы подтвердить время.');
    }
    respond(true, 'Спасибо за отзыв! Он отправлен Наталье.');
} catch (RuntimeException $exception) {
    if ($photoPath !== null) {
        @unlink(__DIR__ . '/' . $photoPath);
    }
    respond(false, $exception->getMessage(), 422);
} catch (Throwable $exception) {
    error_log('Form error: ' . $exception->getMessage());
    respond(false, 'Не удалось отправить форму. Попробуйте ещё раз или позвоните.', 500);
}

