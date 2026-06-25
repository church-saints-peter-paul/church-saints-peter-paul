<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

// إعدادات قاعدة البيانات - عدل هذه حسب إعداداتك
$host = 'localhost';
$dbname = 'service_system';
$username = 'root';  // عادةً root في XAMPP
$password = '';      // عادةً فارغ في XAMPP

// إذا كنت تستخدم hosting قد تحتاج تغيير هذه الإعدادات
// $host = 'localhost';
// $dbname = 'id12345678_service_system';
// $username = 'id12345678_user';
// $password = 'your_password';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch(PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'فشل الاتصال بقاعدة البيانات: ' . $e->getMessage()]);
    exit;
}
?>