<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $userCode = $input['code'] ?? '';
    
    try {
        // زيادة النقاط للمستخدم
        $stmt = $pdo->prepare("UPDATE users SET points = points + 1 WHERE user_code = ?");
        $stmt->execute([$userCode]);
        
        if ($stmt->rowCount() > 0) {
            // جلب البيانات المحدثة
            $stmt = $pdo->prepare("SELECT points FROM users WHERE user_code = ?");
            $stmt->execute([$userCode]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
                'message' => 'تم إضافة نقطة بنجاح',
                'points' => $user['points']
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'فشل في تحديث النقاط']);
        }
        
    } catch(PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'خطأ في تحديث النقاط: ' . $e->getMessage()]);
    }
}
?>