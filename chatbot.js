// استيراد مكتبة Google Gemini
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ⚠️ ضع مفتاح API الخاص بك هنا بدلاً من النص الموجود
const API_KEY = "AIzaSyDmOWPdfJkiraC-xwbamVpBENiCReQkPLw"; 

const genAI = new GoogleGenerativeAI(API_KEY);

const chatbotToggler = document.querySelector(".chatbot-toggler");
const closeBtn = document.querySelector(".close-btn");
const chatbox = document.querySelector(".chatbox");
const chatInput = document.querySelector(".chat-input textarea");
const sendChatBtn = document.querySelector(".chat-input span");

let userMessage = null;
const inputInitHeight = chatInput.scrollHeight;

// شخصية "أبونا" (System Prompt)
// هذه التعليمات هي التي تجعله يتصرف ككاهن مصري
const systemInstruction = `
أنت "أبونا"، مساعد ذكي في موقع كنيسة القديسين بطرس وبولس.
شخصيتك:
1. كاهن قبطي أرثوذكسي حكيم، محب، ومتواضع.
2. تتحدث باللهجة المصرية العامية الودودة جداً (زي الناس العادية ما بتتكلم، بلاش لغة عربية فصحى مقعرة إلا في الآيات).
3. أسلوبك أبوي ومشجع، بتستخدم كلمات زي (يا ابني، يا بنتي، يا حبيبي، ربنا يباركك).
4. مرجعيتك هي الكتاب المقدس، التعليم الأرثوذكسي، أقوال الآباء، واللاهوت الدفاعي.
5. الإجابات تكون مختصرة ومفيدة، وبلاش مواعظ طويلة إلا لو اتطلبت منك.
6. لو اتسألت سؤال مش ديني (زي "ازيك" أو "عامل ايه") رد بطبيعية ومرح كإنسان عادي جداً.
7. لا تذكر أنك ذكاء اصطناعي إلا للضرورة القصوى، تصرف كأنك "أبونا" اللي بيرد في الموقع.
8. استخدم الإيموجي المناسب بشكل بسيط ✝️🙏❤️.
`;

const createChatLi = (message, className) => {
    const chatLi = document.createElement("li");
    chatLi.classList.add("chat", `${className}`);
    let chatContent = className === "outgoing" ? `<p></p>` : `<span class="material-symbols-outlined">account_circle</span><p></p>`;
    chatLi.innerHTML = chatContent;
    chatLi.querySelector("p").textContent = message;
    return chatLi;
}

const generateResponse = async (chatElement) => {
    const messageElement = chatElement.querySelector("p");

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // تجهيز المحادثة مع تعليمات النظام وتاريخ المحادثة البسيط
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: systemInstruction }],
                },
                {
                    role: "model",
                    parts: [{ text: "حاضر يا ابني، أنا جاهز أرد على أي سؤال بنعمة ربنا. اتفضل." }],
                }
            ],
        });

        const result = await chat.sendMessage(userMessage);
        const response = result.response.text();
        
        messageElement.textContent = response.trim();
    } catch (error) {
        messageElement.classList.add("error");
        messageElement.textContent = "سامحني يا ابني، النت فيه مشكلة أو السيستم واقع. جرب تاني كمان شوية. 🙏";
        console.error(error);
    } finally {
        chatbox.scrollTo(0, chatbox.scrollHeight);
    }
}

const handleChat = () => {
    userMessage = chatInput.value.trim(); 
    if(!userMessage) return;

    // Reset input area
    chatInput.value = "";
    chatInput.style.height = `${inputInitHeight}px`;

    // Append User Message
    chatbox.appendChild(createChatLi(userMessage, "outgoing"));
    chatbox.scrollTo(0, chatbox.scrollHeight);

    // Show "Thinking..." Message
    setTimeout(() => {
        const incomingChatLi = createChatLi("جاري الكتابة...", "incoming");
        chatbox.appendChild(incomingChatLi);
        chatbox.scrollTo(0, chatbox.scrollHeight);
        generateResponse(incomingChatLi);
    }, 600);
}

chatInput.addEventListener("input", () => {
    chatInput.style.height = `${inputInitHeight}px`;
    chatInput.style.height = `${chatInput.scrollHeight}px`;
});

chatInput.addEventListener("keydown", (e) => {
    if(e.key === "Enter" && !e.shiftKey && window.innerWidth > 800) {
        e.preventDefault();
        handleChat();
    }
});

sendChatBtn.addEventListener("click", handleChat);
closeBtn.addEventListener("click", () => document.body.classList.remove("show-chatbot"));
chatbotToggler.addEventListener("click", () => document.body.classList.toggle("show-chatbot"));