import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import './ChatList.css';

interface Conversation {
  id: string;
  title: string;
  lastMessage?: string;
  lastMessageAt?: Timestamp;
  createdAt: Timestamp;
}

interface ChatListProps {
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
}

function ChatList({ selectedChatId, onSelectChat, onNewChat }: ChatListProps) {
  const { currentUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = currentUser?.uid || '';

  useEffect(() => {
    if (!userId) return;

    // Listen to user's conversations
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('studentId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chats: Conversation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        chats.push({
          id: doc.id,
          title: data.title || 'New Chat',
          lastMessage: data.lastMessage,
          lastMessageAt: data.lastMessageAt,
          createdAt: data.createdAt,
        });
      });
      
      // Sort client-side to avoid needing Firestore index
      chats.sort((a, b) => {
        const aTime = a.lastMessageAt?.toMillis() || a.createdAt?.toMillis() || 0;
        const bTime = b.lastMessageAt?.toMillis() || b.createdAt?.toMillis() || 0;
        return bTime - aTime; // Descending order
      });
      
      setConversations(chats);
      setLoading(false);
    }, (error) => {
      console.error('Error loading conversations:', error);
      setConversations([]);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  const handleNewChat = async () => {
    if (!userId) return;

    try {
      // Create new conversation
      const conversationsRef = collection(db, 'conversations');
      const newConv = await addDoc(conversationsRef, {
        studentId: userId,
        title: 'New Chat',
        messages: [],
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
      });

      onSelectChat(newConv.id);
      onNewChat();
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  };

  if (loading) {
    return (
      <div className="chat-list">
        <div className="chat-list-header">
          <button className="new-chat-button" disabled>
            New Chat
          </button>
        </div>
        <div className="chat-list-loading">Loading conversations...</div>
      </div>
    );
  }

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <button className="new-chat-button" onClick={handleNewChat}>
          <span className="new-chat-icon">+</span>
          New Chat
        </button>
      </div>
      <div className="chat-list-items">
        {conversations.length === 0 ? (
          <div className="chat-list-empty">
            <p>No conversations yet</p>
            <p className="chat-list-empty-hint">Click "New Chat" to start</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`chat-list-item ${selectedChatId === conv.id ? 'active' : ''}`}
              onClick={() => onSelectChat(conv.id)}
            >
              <div className="chat-list-item-title">{conv.title}</div>
              {conv.lastMessage && (
                <div className="chat-list-item-preview">
                  {conv.lastMessage.substring(0, 50)}
                  {conv.lastMessage.length > 50 ? '...' : ''}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ChatList;

