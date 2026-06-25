<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $userId = $input['userId'] ?? '';
    
    try {
        // تحديث وقت آخر تسجيل خروج
        $updateStmt = $pdo->prepare("UPDATE users SET last_logout = NOW() WHERE id = ?");
        $updateStmt->execute([$userId]);
        
        // تحديث سجل الدخول الأخير
        $logStmt = $pdo->prepare("UPDATE login_logs SET logout_time = NOW() WHERE user_id = ? AND logout_time IS NULL ORDER BY login_time DESC LIMIT 1");
        $logStmt->execute([$userId]);
        
        echo json_encode(['success' => true, 'message' => 'تم تسجيل الخروج بنجاح']);
        
    } catch(PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'خطأ في تسجيل الخروج: ' . $e->getMessage()]);
    }
}
?>