// hymns-library.js

document.addEventListener('DOMContentLoaded', function() {
    // نظام التنبيهات المرن (يستخدم توست الصفحة الرئيسية إن وجد)
    function showHymnToast(message, type = 'success') {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            let container = document.getElementById('localToastContainer');
            if (!container) {
                container = document.createElement('div');
                container.id = 'localToastContainer';
                container.style.cssText = 'position:fixed; top:20px; left:20px; z-index:999999; display:flex; flex-direction:column; gap:10px; direction:rtl;';
                document.body.appendChild(container);
            }
            const toast = document.createElement('div');
            toast.style.cssText = 'background:rgba(1, 51, 70, 0.95); border:1px solid rgba(212,160,23,0.4); border-radius:8px; padding:12px 20px; min-width:250px; color:#fff; font-family:Cairo,sans-serif; box-shadow:0 5px 15px rgba(0,0,0,0.3); font-size:14px;';
            toast.textContent = (type === 'success' ? '✅ ' : '⚠️ ') + message;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    }

    // العناصر الأساسية
    const hymnsContainer = document.getElementById('hymnsContainer');
    const alphabetButtons = document.getElementById('alphabetButtons');
    const hymnSearch = document.getElementById('hymnSearch');
    const searchBtn = document.getElementById('searchBtn');
    const totalHymns = document.getElementById('totalHymns');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const hymnModal = document.getElementById('hymnModal');
    const closeModal = document.getElementById('closeModal');
    
    // بيانات الترانيم (514 ترنيمة)
    const allHymns = [
        // المجموعة الأولى: الترانيم بحرف الألف
        { id: 1, title: "آدم الحكيم في الفردوس", number: "1", category: "ترانيم آدمية", tune: "لحن عادي" },
        { id: 2, title: "أبانا الذي في السموات", number: "2", category: "ترانيم الصلاة الربانية", tune: "لحن شجي" },
        { id: 3, title: "أتى الوقت لتبارك الرب", number: "3", category: "ترانيم التسبحة", tune: "لحن فرح" },
        { id: 4, title: "أحبك يا يسوع", number: "4", category: "ترانيم حب المسيح", tune: "لحن عاطفي" },
        { id: 5, title: "أحمل صليبي وأتبعك", number: "5", category: "ترانيم الصليب", tune: "لحن تأملي" },
        { id: 6, title: "أرنيم لنعمة الله", number: "6", category: "ترانيم النعمة", tune: "لحن فرح" },
        { id: 7, title: "أسجد لك ياسيدي", number: "7", category: "ترانيم السجود", tune: "لحن خاشع" },
        { id: 8, title: "أصعد بروح التسبيح", number: "8", category: "ترانيم التسبحة", tune: "لحن مرنم" },
        { id: 9, title: "أغفر لي يا ربي", number: "9", category: "ترانيم التوبة", tune: "لحن ندم" },
        { id: 10, title: "أفرح يا مريم", number: "10", category: "ترانيم العذراء", tune: "لحن بهيج" },
        
        // المجموعة الثانية: الترانيم بحرف الباء
        { id: 11, title: "بالروح القدس المسحة", number: "11", category: "ترانيم الروح القدس", tune: "لحن عميق" },
        { id: 12, title: "بالحق أقول لكم", number: "12", category: "ترانيم الإنجيل", tune: "لحن تعليمي" },
        { id: 13, title: "بدمك الكريم", number: "13", category: "ترانيم الفداء", tune: "لحن فدائي" },
        { id: 14, title: "بسلام عميق", number: "14", category: "ترانيم السلام", tune: "لحن هادئ" },
        { id: 15, title: "بنعمة الله", number: "15", category: "ترانيم النعمة", tune: "لحن شكر" },
        
        // المجموعة الثالثة: الترانيم بحرف التاء
        { id: 16, title: "تبارك اسمك يارب", number: "16", category: "ترانيم التسبيح", tune: "لحن مرتفع" },
        { id: 17, title: "تباركت أيها الكلمة", number: "17", category: "ترانيم التجسد", tune: "لحن لاهوتي" },
        { id: 18, title: "تجلّى الرب على الجبل", number: "18", category: "ترانيم التجلّي", tune: "لحن مجيد" },
        { id: 19, title: "تعالوا إليّ يا جميع المتعبين", number: "19", category: "ترانيم الراحة", tune: "لحن慰藉" },
        { id: 20, title: "تعالوا نرنم مزموراً", number: "20", category: "ترانيم المزامير", tune: "لحن داودي" },
        
        // المجموعة الرابعة: الترانيم بحرف الجيم
        { id: 21, title: "جئت إليك يارب", number: "21", category: "ترانيم التضرع", tune: "لحن تضرعي" },
        { id: 22, title: "جمالك يارب", number: "22", category: "ترانيم الجمال الإلهي", tune: "لحن جميل" },
        { id: 23, title: "جميع الأمم هلموا", number: "23", category: "ترانيم الشهادة", tune: "لحن عالمي" },
        { id: 24, title: "جودك يارب", number: "24", category: "ترانيم العطاء", tune: "لحن عطاء" },
        
        // ... وهكذا نستمر حتى 514 ترنيمة
        
        // لأغراض العرض، سأضيف بعض الترانيم النموذجية فقط
        // في التطبيق الحقيقي، يجب إضافة جميع الـ 514 ترنيمة
        
        { id: 500, title: "يا قديسين الله", number: "500", category: "ترانيم القديسين", tune: "لحن مجيد" },
        { id: 501, title: "يا قيامة وحياه", number: "501", category: "ترانيم القيامة", tune: "لحن قيامي" },
        { id: 502, title: "يا كلمة الله الأزلي", number: "502", category: "ترانيم اللوغوس", tune: "لحن لاهوتي" },
        { id: 503, title: "يا ملاك السلام", number: "503", category: "ترانيم الملائكة", tune: "لحن سماوي" },
        { id: 504, title: "يا من للأموات تعطي حياة", number: "504", category: "ترانيم الحياة", tune: "لحن حيوي" },
        { id: 505, title: "يا من له المجد", number: "505", category: "ترانيم المجد", tune: "لحن مجيد" },
        { id: 506, title: "يا من نوره أشرق", number: "506", category: "ترانيم النور", tune: "لحن منير" },
        { id: 507, title: "يا نور العالم", number: "507", category: "ترانيم النور", tune: "لحن منير" },
        { id: 508, title: "يا هيكل نوراني", number: "508", category: "ترانيم الهيكل", tune: "لحن مقدس" },
        { id: 509, title: "يا واحة في الصحراء", number: "509", category: "ترانيم التعزية", tune: "لحن慰藉" },
        { id: 510, title: "يا يسوع ابن داود", number: "510", category: "ترانيم المسيا", tune: "لحن مسياني" },
        { id: 511, title: "يا يسوع الحبيب", number: "511", category: "ترانيم حب المسيح", tune: "لحن عاطفي" },
        { id: 512, title: "يا يسوع الراعي الصالح", number: "512", category: "ترانيم الرعاية", tune: "لحن رعوي" },
        { id: 513, title: "يا يسوع الملك", number: "513", category: "ترانيم الملكوت", tune: "لحن ملكي" },
        { id: 514, title: "يا يعقوب القديس", number: "514", category: "ترانيم القديسين", tune: "لحن آبائي" }
    ];
    
    // لأغراض العرض، سأستخدم مجموعة مصغرة من الترانيم
    // في التطبيق الحقيقي، يجب أن تحتوي allHymns على جميع الـ 514 ترنيمة
    
    // الحروف العربية
    const arabicAlphabet = [
        'آ', 'أ', 'إ', 'ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 
        'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 
        'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'
    ];
    
    // تهيئة أزرار الحروف الأبجدية
    function initAlphabetButtons() {
        arabicAlphabet.forEach(letter => {
            const button = document.createElement('button');
            button.className = 'alpha-btn';
            button.textContent = letter;
            button.dataset.letter = letter;
            button.addEventListener('click', () => filterByLetter(letter));
            alphabetButtons.appendChild(button);
        });
        
        // إضافة زر "الكل"
        const allButton = document.createElement('button');
        allButton.className = 'alpha-btn active';
        allButton.textContent = 'الكل';
        allButton.dataset.letter = 'all';
        allButton.addEventListener('click', () => filterByLetter('all'));
        alphabetButtons.appendChild(allButton);
    }
    
    // تصفية الترانيم بحرف معين
    function filterByLetter(letter) {
        // تحديث حالة الأزرار النشطة
        document.querySelectorAll('.alpha-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // إظهار رسالة التحميل
        hymnsContainer.innerHTML = '';
        loadingSpinner.style.display = 'block';
        
        // محاكاة التأخير لتحميل البيانات
        setTimeout(() => {
            if (letter === 'all') {
                displayHymns(allHymns);
            } else {
                const filteredHymns = allHymns.filter(hymn => 
                    hymn.title.startsWith(letter) || 
                    hymn.title.startsWith('أ' + letter) ||
                    hymn.title.startsWith('آ' + letter) ||
                    hymn.title.startsWith('إ' + letter)
                );
                displayHymns(filteredHymns);
            }
            
            loadingSpinner.style.display = 'none';
        }, 500);
    }
    
    // عرض الترانيم
    function displayHymns(hymns) {
        hymnsContainer.innerHTML = '';
        
        if (hymns.length === 0) {
            hymnsContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-music" style="font-size: 3rem; color: #800000; margin-bottom: 20px;"></i>
                    <h3>لا توجد ترانيم تطابق البحث</h3>
                    <p>حاول استخدام مصطلحات بحث مختلفة</p>
                </div>
            `;
            return;
        }
        
        // تجميع الترانيم حسب الحرف الأول
        const groupedHymns = {};
        
        hymns.forEach(hymn => {
            const firstLetter = hymn.title.charAt(0);
            if (!groupedHymns[firstLetter]) {
                groupedHymns[firstLetter] = [];
            }
            groupedHymns[firstLetter].push(hymn);
        });
        
        // عرض الترانيم المجمعة
        Object.keys(groupedHymns).sort().forEach(letter => {
            const section = document.createElement('div');
            section.className = 'hymn-section';
            section.innerHTML = `
                <h2 class="hymn-section-title">${letter}</h2>
                <div class="hymns-grid" id="grid-${letter}"></div>
            `;
            
            hymnsContainer.appendChild(section);
            
            const grid = document.getElementById(`grid-${letter}`);
            groupedHymns[letter].forEach(hymn => {
                const card = createHymnCard(hymn);
                grid.appendChild(card);
            });
        });
        
        // إضافة تأثير الظهور التدريجي
        const sections = document.querySelectorAll('.hymn-section');
        sections.forEach((section, index) => {
            section.style.animationDelay = `${index * 0.1}s`;
        });
    }
    
    // إنشاء بطاقة ترنيم
    function createHymnCard(hymn) {
        const card = document.createElement('div');
        card.className = 'hymn-card';
        card.innerHTML = `
            <div class="hymn-number">${hymn.number}</div>
            <h3 class="hymn-title">${hymn.title}</h3>
            <p class="hymn-tune">${hymn.tune}</p>
            <div class="hymn-actions">
                <button class="hymn-action-small view-hymn" data-id="${hymn.id}">
                    <i class="fas fa-eye"></i> عرض
                </button>
                <button class="hymn-action-small listen-hymn" data-id="${hymn.id}">
                    <i class="fas fa-play"></i> استمع
                </button>
            </div>
        `;
        
        // إضافة حدث النقر لعرض تفاصيل الترانيم
        card.querySelector('.view-hymn').addEventListener('click', () => showHymnDetails(hymn.id));
        card.querySelector('.listen-hymn').addEventListener('click', () => playHymn(hymn.id));
        
        // النقر على البطاقة نفسها يعرض التفاصيل
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('hymn-action-small')) {
                showHymnDetails(hymn.id);
            }
        });
        
        return card;
    }
    
    // عرض تفاصيل الترانيم في المودال
    function showHymnDetails(id) {
        const hymn = allHymns.find(h => h.id === id);
        if (!hymn) return;
        
        document.getElementById('modalHymnTitle').textContent = hymn.title;
        document.getElementById('modalHymnNumber').textContent = hymn.number;
        document.getElementById('modalHymnCategory').textContent = hymn.category;
        document.getElementById('modalHymnTune').textContent = hymn.tune;
        
        // كلمات الترانيم (نموذجية)
        const lyrics = `
            <p>${hymn.title}، ${hymn.title}</p>
            <p>يا ربنا يسوع المسيح</p>
            <p>نسبحك و نمجدك</p>
            <p>الآن و كل أوان</p>
            <p>و إلى دهر الدهور</p>
            <p>آمين.</p>
        `;
        
        document.getElementById('modalHymnLyrics').innerHTML = lyrics;
        
        // إضافة أحداث للأزرار في المودال
        document.getElementById('playHymnBtn').onclick = () => playHymn(id);
        document.getElementById('downloadHymnBtn').onclick = () => downloadHymn(id);
        document.getElementById('shareHymnBtn').onclick = () => shareHymn(hymn);
        
        // عرض المودال
        hymnModal.style.display = 'block';
    }
    
    // تشغيل الترانيم
    function playHymn(id) {
        const hymn = allHymns.find(h => h.id === id);
        if (!hymn) return;
        
        // في التطبيق الحقيقي، هنا سيتم تشغيل الصوت
        showHymnToast(`جاري تشغيل ترنيمة: ${hymn.title} (رقم ${hymn.number})`, 'success');
        
        // محاكاة تشغيل الترانيم
        const audio = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
        audio.play().catch(e => console.log('Error playing audio:', e));
    }
    
    // تحميل الترانيم
    function downloadHymn(id) {
        const hymn = allHymns.find(h => h.id === id);
        if (!hymn) return;
        
        // في التطبيق الحقيقي، هنا سيتم تحميل الملف
        showHymnToast(`جاري تحميل ترنيمة: ${hymn.title} (رقم ${hymn.number})`, 'success');
        
        // محاكاة التحميل
        const link = document.createElement('a');
        link.href = '#';
        link.download = `ترنيمة_${hymn.number}_${hymn.title}.pdf`;
        link.click();
    }
    
    // مشاركة الترانيم
    function shareHymn(hymn) {
        // مشاركة عبر Web Share API إذا كان متاحاً
        if (navigator.share) {
            navigator.share({
                title: hymn.title,
                text: `ترنيمة ${hymn.number}: ${hymn.title}`,
                url: window.location.href
            }).catch(error => console.log('Error sharing:', error));
        } else {
            // نسخ الرابط إلى الحافظة
            navigator.clipboard.writeText(`${hymn.title} - ترنيمة رقم ${hymn.number}`)
                .then(() => showHymnToast('تم نسخ كلمات الترنيمة إلى الحافظة', 'success'))
                .catch(err => showHymnToast('تعذر نسخ كلمات الترنيمة', 'error'));
        }
    }
    
    // البحث في الترانيم
    function searchHymns() {
        const searchTerm = hymnSearch.value.trim().toLowerCase();
        
        if (searchTerm === '') {
            displayHymns(allHymns);
            return;
        }
        
        const results = allHymns.filter(hymn => 
            hymn.title.toLowerCase().includes(searchTerm) ||
            hymn.number.includes(searchTerm) ||
            hymn.category.toLowerCase().includes(searchTerm) ||
            hymn.tune.toLowerCase().includes(searchTerm)
        );
        
        displayHymns(results);
        
        // عرض عدد النتائج
        const searchResults = document.getElementById('searchResults');
        searchResults.textContent = `نتائج البحث: ${results.length} ترنيمة`;
        searchResults.style.display = 'inline';
    }
    
    // تهيئة مكتبة الترانيم
    function initHymnsLibrary() {
        // تعيين العدد الإجمالي للترانيم
        totalHymns.textContent = `إجمالي الترانيم: ${allHymns.length}`;
        
        // تهيئة أزرار الحروف الأبجدية
        initAlphabetButtons();
        
        // عرض جميع الترانيم في البداية
        displayHymns(allHymns);
        
        // إخفاء شاشة التحميل بعد فترة
        setTimeout(() => {
            loadingSpinner.style.display = 'none';
        }, 1000);
    }
    
    // إضافة أحداث المستخدم
    function setupEventListeners() {
        // حدث البحث
        searchBtn.addEventListener('click', searchHymns);
        hymnSearch.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                searchHymns();
            }
        });
        
        // إغلاق المودال
        closeModal.addEventListener('click', () => {
            hymnModal.style.display = 'none';
        });
        
        // إغلاق المودال عند النقر خارج المحتوى
        window.addEventListener('click', (e) => {
            if (e.target === hymnModal) {
                hymnModal.style.display = 'none';
            }
        });
        
        // تحديث سنة التذييل
        document.getElementById('currentYear').textContent = new Date().getFullYear();
    }
    
    // تهيئة مكتبة الترانيم عند تحميل الصفحة
    initHymnsLibrary();
    setupEventListeners();
});