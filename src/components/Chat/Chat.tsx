import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, Timestamp, orderBy, doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navigation from '../Shared/Navigation';
import './Chat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Timestamp;
}

function Chat() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || '';
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load or create conversation
  useEffect(() => {
    if (!userId) return;

    // Check for existing conversation
    const conversationsQuery = query(
      collection(db, 'conversations'),
      where('studentId', '==', userId),
      orderBy('lastMessageAt', 'desc'),
      // limit(1) // Get most recent
    );

    const unsubscribe = onSnapshot(conversationsQuery, (snapshot) => {
      if (!snapshot.empty) {
        const latestConv = snapshot.docs[0];
        setConversationId(latestConv.id);
        
        // Load messages for this conversation
        const messagesQuery = query(
          collection(db, 'conversations', latestConv.id, 'messages'),
          orderBy('timestamp', 'asc')
        );

        onSnapshot(messagesQuery, (messagesSnapshot) => {
          const loadedMessages = messagesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as Message[];
          setMessages(loadedMessages);
        });
      }
    });

    return unsubscribe;
  }, [userId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !userId) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      // Add user message to UI immediately
      const tempUserMessage: Message = {
        id: 'temp-' + Date.now(),
        role: 'user',
        content: userMessage,
        timestamp: Timestamp.now(),
      };
      setMessages(prev => [...prev, tempUserMessage]);

      // Get or create conversation
      let convId = conversationId;
      if (!convId) {
        // Create new conversation
        const newConv = await addDoc(collection(db, 'conversations'), {
          studentId: userId,
          createdAt: Timestamp.now(),
          lastMessageAt: Timestamp.now(),
        });
        convId = newConv.id;
        setConversationId(convId);
      }

      // Add user message to Firestore
      await addDoc(collection(db, 'conversations', convId, 'messages'), {
        role: 'user',
        content: userMessage,
        timestamp: Timestamp.now(),
      });

      // Update conversation last message time
      const convRef = doc(db, 'conversations', convId);
      await updateDoc(convRef, {
        lastMessageAt: Timestamp.now(),
      });

      // Get student context for AI
      const studentDoc = await getDoc(doc(db, 'students', userId));
      const studentData = studentDoc.data();

      // Call Firebase Function to generate AI response
      const generateChatResponseFunction = httpsCallable(functions, 'generateChatResponseFunction');
      const result = await generateChatResponseFunction({
        conversationId: convId,
        userMessage: userMessage,
        studentContext: {
          name: studentData?.name || 'Student',
          goals: studentData?.goals || [],
          recentSessions: [],
          struggles: studentData?.gamification?.struggles || [],
        },
      });

      const aiResponse = (result.data as { response: string }).response;

      // Add AI response to Firestore
      await addDoc(collection(db, 'conversations', convId, 'messages'), {
        role: 'assistant',
        content: aiResponse,
        timestamp: Timestamp.now(),
      });

      // Remove temp message and add real messages
      setMessages(prev => {
        const filtered = prev.filter(m => !m.id.startsWith('temp-'));
        return [...filtered, {
          id: 'user-' + Date.now(),
          role: 'user' as const,
          content: userMessage,
          timestamp: Timestamp.now(),
        }, {
          id: 'ai-' + Date.now(),
          role: 'assistant' as const,
          content: aiResponse,
          timestamp: Timestamp.now(),
        }];
      });
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove temp message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
      // Error is already logged to console, no need for alert
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat">
      <header className="chat-header">
        <h1>AI Study Companion</h1>
        <Navigation />
      </header>
      <main className="chat-main">
        <div className="chat-container">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-welcome">
                <h2>👋 Hi! I'm your AI Study Companion</h2>
                <p>Ask me anything about your studies, or get help with topics from your sessions!</p>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message ${message.role === 'user' ? 'user-message' : 'ai-message'}`}
              >
                <div className="message-content">{message.content}</div>
              </div>
            ))}
            {isLoading && (
              <div className="chat-message ai-message">
                <div className="message-content">
                  <span className="typing-indicator">...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input-container">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type your message... (Press Enter to send)"
              className="chat-input"
              rows={3}
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="chat-send-button"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Chat;
