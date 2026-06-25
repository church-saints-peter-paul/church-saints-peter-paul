<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $userCode = $input['code'] ?? '';
    
    try {
        // البحث عن المستخدم بالكود
        $stmt = $pdo->prepare("SELECT * FROM users WHERE user_code = ?");
        $stmt->execute([$userCode]);
        
        if ($stmt->rowCount() > 0) {
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            
            // تحديث وقت آخر تسجيل دخول
            $updateStmt = $pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = ?");
            $updateStmt->execute([$user['id']]);
            
            // تسجيل عملية الدخول
            $logStmt = $pdo->prepare("INSERT INTO login_logs (user_id) VALUES (?)");
            $logStmt->execute([$user['id']]);
            
            echo json_encode([
                'success' => true,
                'message' => 'تم تسجيل الدخول بنجاح',
                'user' => [
                    'id' => $user['id'],
                    'fullName' => $user['full_name'],
                    'birthDate' => $user['birth_date'],
                    'phone' => $user['phone'],
                    'code' => $user['user_code'],
                    'points' => $user['points']
                ]
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'الكود غير صحيح']);
        }
        
    } catch(PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'خطأ في تسجيل الدخول: ' . $e->getMessage()]);
    }
}
?>