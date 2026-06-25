<?php
// إعدادات أساسية للتعامل مع طلبات AJAX
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// السماح بطلبات OPTIONS (لطلبات CORS)
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ملف لتخزين البيانات
$dataFile = 'service_data.json';

// دالة لقراءة البيانات من الملف
function readData() {
    global $dataFile;
    if (!file_exists($dataFile)) {
        // إنشاء ملف جديد إذا لم يكن موجوداً
        $initialData = ['users' => [], 'transactions' => []];
        file_put_contents($dataFile, json_encode($initialData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        return $initialData;
    }
    
    $content = file_get_contents($dataFile);
    if ($content === false) {
        return ['users' => [], 'transactions' => []];
    }
    
    $data = json_decode($content, true);
    return $data ?: ['users' => [], 'transactions' => []];
}

// دالة لحفظ البيانات في الملف
function saveData($data) {
    global $dataFile;
    $result = file_put_contents($dataFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    return $result !== false;
}

// الحصول على بيانات الإدخال
$input = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // معالجة البيانات المرسلة عبر FormData
    $input = $_POST;
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $input = $_GET;
}

$action = $input['action'] ?? '';
$response = ['success' => false, 'message' => ''];

try {
    switch ($action) {
        case 'register':
            $fullName = trim($input['fullName'] ?? '');
            $birthDate = $input['birthDate'] ?? '';
            $phone = trim($input['phone'] ?? '');
            $code = $input['code'] ?? '';
            
            if (empty($fullName) || empty($birthDate) || empty($phone) || empty($code)) {
                $response['message'] = 'جميع الحقول مطلوبة';
                break;
            }
            
            $data = readData();
            
            // التحقق من عدم وجود كود مكرر
            foreach ($data['users'] as $user) {
                if ($user['code'] === $code) {
                    $response['message'] = 'هذا الكود مسجل مسبقاً';
                    echo json_encode($response);
                    exit;
                }
            }
            
            // إضافة المستخدم الجديد
            $newUser = [
                'fullName' => $fullName,
                'birthDate' => $birthDate,
                'phone' => $phone,
                'code' => $code,
                'points' => 0,
                'registrationDate' => date('Y-m-d H:i:s')
            ];
            
            $data['users'][] = $newUser;
            $saved = saveData($data);
            
            if ($saved) {
                $response['success'] = true;
                $response['message'] = 'تم التسجيل بنجاح';
                $response['user'] = $newUser;
            } else {
                $response['message'] = 'حدث خطأ في حفظ البيانات';
            }
            break;
            
        case 'login':
            $code = $input['code'] ?? '';
            
            if (empty($code)) {
                $response['message'] = 'يرجى إدخال الكود';
                break;
            }
            
            $data = readData();
            $userFound = null;
            
            foreach ($data['users'] as $user) {
                if ($user['code'] === $code) {
                    $userFound = $user;
                    break;
                }
            }
            
            if ($userFound) {
                $response['success'] = true;
                $response['message'] = 'تم تسجيل الدخول بنجاح';
                $response['user'] = $userFound;
            } else {
                $response['message'] = 'الكود غير صحيح';
            }
            break;
            
        case 'add_points':
            $servedCode = trim($input['servedCode'] ?? '');
            $servantName = trim($input['servantName'] ?? '');
            
            if (empty($servedCode) || empty($servantName)) {
                $response['message'] = 'بيانات غير مكتملة';
                break;
            }
            
            $data = readData();
            $userFound = false;
            $updatedUser = null;
            
            foreach ($data['users'] as &$user) {
                if ($user['code'] === $servedCode) {
                    $user['points'] += 1;
                    $userFound = true;
                    $updatedUser = $user;
                    
                    // تسجيل العملية
                    $transaction = [
                        'servedCode' => $servedCode,
                        'servantName' => $servantName,
                        'pointsAdded' => 1,
                        'timestamp' => date('Y-m-d H:i:s')
                    ];
                    $data['transactions'][] = $transaction;
                    
                    break;
                }
            }
            
            if ($userFound) {
                $saved = saveData($data);
                if ($saved) {
                    $response['success'] = true;
                    $response['message'] = 'تم إضافة نقطة بنجاح';
                    $response['user'] = $updatedUser;
                } else {
                    $response['message'] = 'حدث خطأ في حفظ البيانات';
                }
            } else {
                $response['message'] = 'كود المخدوم غير صحيح';
            }
            break;
            
        case 'get_stats':
            $servantName = trim($input['servantName'] ?? '');
            
            $data = readData();
            $transactions = $data['transactions'] ?? [];
            $today = date('Y-m-d');
            
            $stats = [
                'totalPoints' => 0,
                'servedCount' => 0,
                'todayPoints' => 0,
                'sessionCount' => 0
            ];
            
            $servedCodes = [];
            foreach ($transactions as $transaction) {
                if ($transaction['servantName'] === $servantName) {
                    $stats['totalPoints'] += $transaction['pointsAdded'];
                    
                    if (!in_array($transaction['servedCode'], $servedCodes)) {
                        $servedCodes[] = $transaction['servedCode'];
                    }
                    
                    if (date('Y-m-d', strtotime($transaction['timestamp'])) === $today) {
                        $stats['todayPoints'] += $transaction['pointsAdded'];
                    }
                }
            }
            
            $stats['servedCount'] = count($servedCodes);
            
            $response['success'] = true;
            $response['stats'] = $stats;
            break;
            
        case 'test_connection':
            // فحص الاتصال
            $response['success'] = true;
            $response['message'] = 'الاتصال يعمل بشكل صحيح';
            $response['server_time'] = date('Y-m-d H:i:s');
            break;
            
        default:
            $response['message'] = 'إجراء غير معروف: ' . $action;
    }
} catch (Exception $e) {
    $response['message'] = 'حدث خطأ في الخادم: ' . $e->getMessage();
}

echo json_encode($response);
?>