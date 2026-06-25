<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $userCode = $input['code'] ?? '';
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE user_code = ?");
        $stmt->execute([$userCode]);
        
        if ($stmt->rowCount() > 0) {
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
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
            echo json_encode(['success' => false, 'message' => 'المستخدم غير موجود']);
        }
        
    } catch(PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'خطأ في جلب البيانات: ' . $e->getMessage()]);
    }
}
?>