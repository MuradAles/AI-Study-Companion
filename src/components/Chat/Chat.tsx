import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, onSnapshot, Timestamp, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import ChatList from './ChatList';
import MathRenderer from '../Shared/MathRenderer';
import StepByStepRenderer from '../Shared/StepByStepRenderer';
import './Chat.css';

interface ChatMessage {
  role: 'student' | 'assistant';
  content: string;
  timestamp: Timestamp | Date;
  suggestions?: {
    type: 'cross_sell' | 'new_subject';
    subjects: string[];
  };
}

function Chat() {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState('New Chat');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userId = currentUser?.uid || '';

  // Load specific conversation
  const loadConversation = async (chatId: string) => {
    try {
      const conversationRef = doc(db, 'conversations', chatId);
      const conversationDoc = await getDoc(conversationRef);

      if (conversationDoc.exists()) {
        const data = conversationDoc.data();
        setConversationId(chatId);
        setConversationTitle(data.title || 'New Chat');
        // Convert Firestore Timestamps to Date objects
        const loadedMessages = (data.messages || []).map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp),
        }));
        setMessages(loadedMessages);
      } else {
        setConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      setConversationId(null);
      setMessages([]);
    }
  };

  const handleNewChat = () => {
    setConversationId(null);
    setMessages([]);
    setConversationTitle('New Chat');
  };

  // Real-time listener for conversation updates
  useEffect(() => {
    if (!conversationId) return;

    const conversationRef = doc(db, 'conversations', conversationId);
    const unsubscribe = onSnapshot(conversationRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        // Convert Firestore Timestamps to Date objects
        const loadedMessages = (data.messages || []).map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp),
        }));
        setMessages(loadedMessages);
      }
    });

    return unsubscribe;
  }, [conversationId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    // Scroll the messages container to bottom, not the entire page
    // Use setTimeout to ensure DOM has updated
    const scrollToBottom = () => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    };
    
    // Immediate scroll
    scrollToBottom();
    
    // Also scroll after a tiny delay to catch any async DOM updates
    const timeoutId = setTimeout(scrollToBottom, 100);
    
    return () => clearTimeout(timeoutId);
  }, [messages, loading]);

  // Save conversation to Firestore
  const saveConversation = async (updatedMessages: ChatMessage[]) => {
    if (!conversationId) return;

    try {
      const conversationRef = doc(db, 'conversations', conversationId);
      // Convert Date objects to Timestamps for Firestore
      const messagesForFirestore = updatedMessages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date 
          ? Timestamp.fromDate(msg.timestamp) 
          : msg.timestamp,
      }));

      // Get last message for preview
      const lastMsg = updatedMessages[updatedMessages.length - 1];
      const lastMessage = lastMsg?.role === 'student' ? lastMsg.content : '';

      // Update title if this is the first message
      const updateData: any = {
        studentId: userId,
        messages: messagesForFirestore,
        lastMessage,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // If this is the first user message, generate a title
      const userMessages = updatedMessages.filter(m => m.role === 'student');
      if (userMessages.length === 1) {
        const firstMessage = userMessages[0].content;
        const title = firstMessage.substring(0, 40) + (firstMessage.length > 40 ? '...' : '');
        updateData.title = title;
        setConversationTitle(title);
      }

      await setDoc(conversationRef, updateData, { merge: true });
    } catch (error) {
      // Error saving conversation
    }
  };

  // Handle sending message
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading || !userId) return;

    const userMessage: ChatMessage = {
      role: 'student',
      content: inputMessage.trim(),
      timestamp: new Date(),
    };

    // Add user message immediately
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputMessage('');
    setLoading(true);

    try {
      // Save user message
      await saveConversation(updatedMessages);

      // Call Firebase function to generate response
      const generateChatResponse = httpsCallable(functions, 'generateChatResponseFunction');
      const result = await generateChatResponse({
        message: inputMessage.trim(),
        conversationHistory: messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp instanceof Date ? Timestamp.fromDate(m.timestamp) : m.timestamp,
        })),
      });

      const responseData = result.data as {
        response: string;
        practiceQuestion?: {
          questionId: string;
          questionText: string;
          topic: string;
          options: string[];
          correctAnswer: string;
        };
        suggestions?: {
          type: 'cross_sell' | 'new_subject';
          subjects: string[];
        };
      };

      // Create assistant message
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: responseData.response,
        timestamp: new Date(),
        suggestions: responseData.suggestions,
      };

      // Add assistant message
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      await saveConversation(finalMessages);
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
      await saveConversation(finalMessages);
    } finally {
      setLoading(false);
    }
  };


  // Handle suggestion click
  const handleSuggestionClick = (subject: string) => {
    setInputMessage(`I want to learn about ${subject}`);
    // Auto-send the message
    setTimeout(() => {
      handleSendMessage();
    }, 100);
  };

  return (
    <div className="chat">
      <main className="chat-main">
        <ChatList
          selectedChatId={conversationId}
          onSelectChat={loadConversation}
          onNewChat={handleNewChat}
        />
        <div className="chat-container">
          {!conversationId ? (
            <div className="chat-welcome-screen">
              <div className="chat-welcome">
                <h2>👋 Welcome to your AI Study Companion!</h2>
                <p>I can help you with questions about your tutoring sessions and generate practice questions.</p>
                <div className="chat-welcome-examples">
                  <p className="chat-welcome-examples-title">Try asking:</p>
                  <div className="chat-welcome-example">"I need help with geometry from my last session"</div>
                  <div className="chat-welcome-example">"Can you explain the quadratic formula?"</div>
                  <div className="chat-welcome-example">"Give me practice problems on SAT Reading"</div>
                </div>
                <p className="chat-welcome-start">Click "New Chat" in the sidebar to get started!</p>
              </div>
            </div>
          ) : (
            <div className="chat-content-wrapper">
              <div className="chat-header-title">
                <h3>{conversationTitle}</h3>
              </div>
              <div className="chat-messages" ref={messagesContainerRef}>
                {messages.length === 0 && (
                  <div className="chat-welcome">
                    <p>👋 Hi! What would you like help with?</p>
                    <p className="chat-help-hint">Tell me what subject or topic from your sessions you'd like to discuss or practice.</p>
                  </div>
                )}
            {messages.map((message, index) => (
              <div key={index} className={`chat-message ${message.role}`}>
                {message.role === 'student' ? (
                  <div className="message-bubble student-bubble">
                    <MathRenderer content={message.content} />
                  </div>
                ) : (
                  <div className="message-bubble assistant-bubble">
                      <StepByStepRenderer content={message.content} />
                      {message.suggestions && message.suggestions.subjects.length > 0 && (
                        <div className="suggestions-card">
                          <p className="suggestions-title">💡 Want to try something new?</p>
                          <p className="suggestions-subtitle">Based on your sessions, you might enjoy:</p>
                          <div className="suggestions-list">
                            {message.suggestions.subjects.map((subject, idx) => (
                              <button
                                key={idx}
                                className="suggestion-button"
                                onClick={() => handleSuggestionClick(subject)}
                              >
                                {subject}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            ))}
            {loading && (
              <div className="chat-message assistant">
                <div className="message-bubble assistant-bubble typing">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
              </div>
            <div className="chat-input-container">
              <input
                type="text"
                className="chat-input"
                placeholder={conversationId ? "Ask a question..." : "Click 'New Chat' to start"}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && conversationId) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={loading || !conversationId}
              />
              <button
                className="chat-send-button"
                onClick={handleSendMessage}
                disabled={loading || !inputMessage.trim() || !conversationId}
              >
                Send
              </button>
            </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Chat;

