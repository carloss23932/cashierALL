import { useMemo, useRef, useState } from "react";
import { Bot, Send, Sparkles, User } from "lucide-react";

type AIMessage = {
  role: "user" | "assistant";
  content: string;
};

const starterPrompts = [
  "حلل أرباح اليوم",
  "اعطني تقرير شهري شامل",
  "اعطني تقرير شامل لكل الكاشير",
  "حلل هذا الشهر مع الفواتير المؤرشفة",
];

export default function AIChatPage({ currentUser }: { currentUser: any }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      role: "assistant",
      content:
        "أهلاً بك. اكتب سؤالك عن المبيعات أو الأرباح أو المخزون أو الفواتير المؤرشفة وسأعطيك تحليلًا مباشرًا.",
    },
  ]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  };

  const sendMessage = async (preset?: string) => {
    const message = String(preset ?? input).trim();
    if (!message || loading) return;

    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    scrollToBottom();

    try {
      const result = await window.api.aiChat({
        message,
        userRole: currentUser?.role || "cashier",
      });

      if (!result?.ok) {
        throw new Error(result?.error || "تعذر الحصول على رد من الذكاء الاصطناعي.");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.response || "لم يصل رد صالح من الذكاء الاصطناعي.",
        },
      ]);
      scrollToBottom();
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error?.message || "حدث خطأ أثناء التواصل مع الذكاء الاصطناعي.",
        },
      ]);
      scrollToBottom();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-slate-900 p-3 text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">الذكاء الاصطناعي</h1>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              مساعد بسيط لتحليل بيانات الكاشير والإجابة عن الأسئلة المتعلقة بالمبيعات، الأرباح، المخزون،
              والأرشيف.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div ref={scrollRef} className="h-[62vh] space-y-4 overflow-y-auto bg-slate-50 p-4">
            {messages.map((message, index) => {
              const isUser = message.role === "user";

              return (
                <div key={`${message.role}-${index}`} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[90%] rounded-3xl px-4 py-3 shadow-sm ${
                      isUser ? "bg-white text-slate-900" : "bg-slate-900 text-white"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium opacity-80">
                      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      <span>{isUser ? "أنت" : "المساعد"}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-7">{message.content}</div>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-end">
                <div className="rounded-3xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                  جارٍ تحليل البيانات...
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="اكتب سؤالك هنا..."
                className="min-h-[72px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
              <button
                onClick={() => void sendMessage()}
                disabled={!canSend}
                className="flex min-w-[120px] items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                <span>إرسال</span>
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-slate-900">أسئلة جاهزة</h2>
          <div className="space-y-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => void sendMessage(prompt)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-right text-sm text-slate-700 transition hover:bg-slate-100"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
