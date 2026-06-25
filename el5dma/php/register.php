<?php
require_once 'config.php';

// تفعيل عرض الأخطاء للت debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    
    // طباعة البيانات المستقبلة للتحقق
    $inputData = file_get_contents('php://input');
    file_put_contents('debug_log.txt', "Received: " . $inputData . "\n", FILE_APPEND);
    
    $input = json_decode($inputData, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo json_encode(['success' => false, 'message' => 'خطأ في تحويل JSON: ' . json_last_error_msg()]);
        exit;
    }
    
    $fullName = $input['fullName'] ?? '';
    $birthDate = $input['birthDate'] ?? '';
    $phone = $input['phone'] ?? '';
    
    // التحقق من البيانات المطلوبة
    if (empty($fullName) || empty($birthDate) || empty($phone)) {
        echo json_encode(['success' => false, 'message' => 'جميع الحقول مطلوبة']);
        exit;
    }
    
    // توليد الكود من تاريخ الميلاد
    try {
        $date = DateTime::createFromFormat('Y-m-d', $birthDate);
        if (!$date) {
            echo json_encode(['success' => false, 'message' => 'تاريخ الميلاد غير صحيح']);
            exit;
        }
        $userCode = $date->format('dmY');
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'خطأ في توليد الكود: ' . $e->getMessage()]);
        exit;
    }
    
    try {
        // التحقق من عدم وجود مستخدم بنفس الكود
        $stmt = $pdo->prepare("SELECT id FROM users WHERE user_code = ?");
        $stmt->execute([$userCode]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode(['success' => false, 'message' => 'المستخدم مسجل مسبقاً']);
            exit;
        }
        
        // تسجيل المستخدم الجديد
        $stmt = $pdo->prepare("INSERT INTO users (full_name, birth_date, phone, user_code) VALUES (?, ?, ?, ?)");
        $result = $stmt->execute([$fullName, $birthDate, $phone, $userCode]);
        
        if ($result) {
            $userId = $pdo->lastInsertId();
            
            echo json_encode([
                'success' => true,
                'message' => 'تم التسجيل بنجاح',
                'user' => [
                    'id' => $userId,
                    'fullName' => $fullName,
                    'birthDate' => $birthDate,
                    'phone' => $phone,
                    'code' => $userCode,
                    'points' => 0
                ]
            ]);
            
            // تسجيل عملية التسجيل في ملف log
            file_put_contents('debug_log.txt', "User registered: " . $fullName . " - " . $userCode . "\n", FILE_APPEND);
            
        } else {
            echo json_encode(['success' => false, 'message' => 'فشل في إدخال البيانات']);
        }
        
    } catch(PDOException $e) {
        $errorMsg = 'خطأ في التسجيل: ' . $e->getMessage();
        file_put_contents('debug_log.txt', "DB Error: " . $e->getMessage() . "\n", FILE_APPEND);
        echo json_encode(['success' => false, 'message' => $errorMsg]);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'طريقة الطلب غير صحيحة']);
}
?>