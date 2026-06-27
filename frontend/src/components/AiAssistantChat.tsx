import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Bot, Sparkles, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { tiaApi } from "@/lib/tiaApi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
}

export default function AiAssistantChat() {
  const { demoRole, demoClientCode } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "bot",
      text: "👋 Hi! I am **TIA AI**, your context-aware Touchless Invoicing Assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      sender: "user",
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Pass client code as context if we are in client portal
      const contextCode = demoRole === "client" ? demoClientCode : undefined;
      const botResponse = await tiaApi.chat(textToSend, contextCode);

      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: botResponse,
          timestamp: new Date(),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: `⚠️ Error communicating with AI server: ${err.message || "Unknown error"}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions =
    demoRole === "client"
      ? [
          "Status of my invoices?",
          "Are there any timesheet errors?",
          "Show details of our staff list",
        ]
      : [
          "Show invoicing overview",
          "List pending exceptions",
          "Show details of Emirates Steel (CL001)",
          "Check employee EMP10058 (Aisha Al Zaabi)",
        ];

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Toggle Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 flex items-center justify-center text-primary-foreground transition-all duration-300 transform hover:scale-105"
        >
          <MessageSquare className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-4 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-chart-4"></span>
          </span>
        </Button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <Card className="w-96 h-[500px] flex flex-col shadow-2xl border-primary/20 backdrop-blur-md bg-opacity-95 overflow-hidden transition-all duration-300">
          {/* Header */}
          <div className="bg-primary text-primary-foreground p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <div className="text-sm font-semibold flex items-center gap-1">
                  TIA AI Assistant <Sparkles className="h-3 w-3 text-yellow-300 fill-yellow-300" />
                </div>
                <div className="text-[10px] opacity-80">
                  Context: {demoRole === "client" ? `Client Portal (${demoClientCode})` : "Ops Manager"}
                </div>
              </div>
            </div>
            <Button
              onClick={() => setIsOpen(false)}
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-white/10 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages Area */}
          <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-muted/20">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-2 max-w-[85%] ${
                  msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 border ${
                    msg.sender === "user"
                      ? "bg-secondary border-muted text-foreground"
                      : "bg-primary/10 border-primary/20 text-primary"
                  }`}
                >
                  {msg.sender === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div
                  className={`p-3 rounded-lg text-xs leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border shadow-sm text-foreground"
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ node, ...props }) => (
                        <div className="overflow-x-auto my-2">
                          <table className="border-collapse border border-muted text-[10px] w-full" {...props} />
                        </div>
                      ),
                      th: ({ node, ...props }) => (
                        <th className="border border-muted bg-muted/50 px-2 py-1 font-semibold" {...props} />
                      ),
                      td: ({ node, ...props }) => (
                        <td className="border border-muted px-2 py-0.5" {...props} />
                      ),
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 mr-auto max-w-[85%]">
                <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="bg-card border p-3 rounded-lg shadow-sm flex items-center gap-1">
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Suggestions */}
          <div className="p-2 border-t flex gap-1.5 overflow-x-auto shrink-0 bg-card">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(s)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full border text-[10px] bg-secondary hover:bg-primary/10 hover:border-primary/30 text-muted-foreground hover:text-primary transition-all shrink-0"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-3 border-t bg-card flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
              placeholder="Ask TIA AI..."
              className="text-xs h-9 flex-1"
            />
            <Button
              onClick={() => handleSend(input)}
              disabled={loading || !input.trim()}
              size="icon"
              className="h-9 w-9 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
