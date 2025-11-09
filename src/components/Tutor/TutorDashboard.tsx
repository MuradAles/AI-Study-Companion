import { useEffect, useState } from 'react';
import { collection, query, updateDoc, doc, Timestamp, getDoc, onSnapshot, addDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navigation from '../Shared/Navigation';
import './TutorDashboard.css';

interface BookingRequest {
  id: string;
  studentId: string;
  tutorName: string;
  tutorId?: string;
  subject: string;
  topic: string;
  date: { toDate: () => Date; toMillis: () => number } | null;
  status: string;
  createdAt: { toDate: () => Date; toMillis: () => number } | null;
}

interface Student {
  id: string;
  name: string;
}

function TutorDashboard() {
  const { currentUser } = useAuth();
  const [pendingBookings, setPendingBookings] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Record<string, Student>>({});

  useEffect(() => {
    if (!currentUser) return;

    // Real-time listener for ALL bookings (pending + accepted by this tutor)
    // Show all bookings in one section, with status badges
    const allBookingsQuery = query(
      collection(db, 'booking_requests')
    );

    const unsubscribePending = onSnapshot(allBookingsQuery, (snapshot) => {
      const allBookings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as BookingRequest));

      // Filter: Show pending OR accepted by this tutor
      const visibleBookings = allBookings.filter(booking => 
        booking.status === 'pending' || 
        (booking.status === 'accepted' && booking.tutorId === currentUser.uid)
      );

      // Sort by date (earliest first)
      visibleBookings.sort((a, b) => {
        const aDate = a.date?.toMillis?.() || 0;
        const bDate = b.date?.toMillis?.() || 0;
        return aDate - bDate;
      });

      setPendingBookings(visibleBookings);
    });

    // Load student names for all visible bookings
    const loadStudentNames = async (bookings: BookingRequest[]) => {
      const studentIds = new Set<string>();
      bookings.forEach(booking => studentIds.add(booking.studentId));

      const studentData: Record<string, Student> = {};
      for (const studentId of studentIds) {
        try {
          const studentRef = doc(db, 'students', studentId);
          const studentSnap = await getDoc(studentRef);
          if (studentSnap.exists()) {
            studentData[studentId] = {
              id: studentSnap.id,
              ...studentSnap.data()
            } as Student;
          }
        } catch (error) {
          console.error(`Error loading student ${studentId}:`, error);
        }
      }

      setStudents(prev => ({ ...prev, ...studentData }));
      setLoading(false);
    };

    // Watch for changes in bookings and load student names
    const unsubscribeStudents = onSnapshot(allBookingsQuery, (snapshot) => {
      const allBookings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as BookingRequest));

      const visibleBookings = allBookings.filter(booking => 
        booking.status === 'pending' || 
        (booking.status === 'accepted' && booking.tutorId === currentUser.uid)
      );

      loadStudentNames(visibleBookings);
    });

    // Cleanup function
    return () => {
      unsubscribePending();
      unsubscribeStudents();
    };
  }, [currentUser]);

  const handleAcceptBooking = async (booking: BookingRequest) => {
    if (!currentUser) return;

    try {
      const bookingRef = doc(db, 'booking_requests', booking.id);
      const tutorName = currentUser.displayName || 'Tutor';
      
      // Update booking status
      await updateDoc(bookingRef, {
        status: 'accepted',
        tutorId: currentUser.uid,
        tutorName: tutorName,
        acceptedAt: Timestamp.now(),
      });

      alert('✅ Booking accepted! You can now generate a fake session for testing.');
    } catch (error) {
      console.error('Error accepting booking:', error);
      alert('Failed to accept booking. Please try again.');
    }
  };

  const handleRemoveBooking = async (bookingId: string) => {
    if (!currentUser) return;
    
    if (!confirm('Are you sure you want to remove this booking?')) {
      return;
    }

    try {
      const bookingRef = doc(db, 'booking_requests', bookingId);
      await updateDoc(bookingRef, {
        status: 'removed',
        removedAt: Timestamp.now(),
      });
      // Note: The booking will disappear from the list due to the filter
    } catch (error) {
      console.error('Error removing booking:', error);
      alert('Failed to remove booking. Please try again.');
    }
  };

  const handleGenerateFakeSession = async (booking: BookingRequest) => {
    if (!currentUser) return;

    try {
      const tutorName = currentUser.displayName || 'Tutor';
      const studentName = students[booking.studentId]?.name || 'Student';

      // Show loading message
      alert('🎨 Generating realistic tutoring session with AI... This may take a moment.');

      // Get or create goalId for the student  
      const studentDoc = await getDoc(doc(db, 'students', booking.studentId));
      const studentData = studentDoc.data();
      let goalId = studentData?.goals?.[0]?.id;
      
      // If student has no goals, create a default one
      if (!goalId) {
        goalId = `goal_${Date.now()}`;
      }

      // Generate realistic conversation using OpenAI via Firebase Cloud Function
      console.log(`🤖 Calling OpenAI to generate transcript for ${booking.subject} - ${booking.topic || 'General'}...`);
      const generateTranscript = httpsCallable(functions, 'generateTutoringTranscript');
      const result = await generateTranscript({
        studentName,
        tutorName,
        subject: booking.subject,
        topic: booking.topic || 'General concepts'
      });

      const { conversation } = result.data as { conversation: Array<{speaker: string; message: string; timestamp: string}> };
      
      console.log(`✅ Generated ${conversation.length} conversation exchanges`);
      
      // Convert conversation array to transcript string format for Firebase Function
      const transcript = conversation.map((msg: {speaker: string; message: string; timestamp: string}) => {
        const speaker = msg.speaker === 'tutor' ? tutorName : studentName;
        return `${speaker}: ${msg.message}`;
      }).join('\n\n');

      // Create a session document with BOTH conversation (array) and transcript (string)
      // The transcript will trigger Firebase Cloud Functions to analyze and generate questions
      const sessionData = {
        studentId: booking.studentId,
        tutorId: currentUser.uid,
        tutorName: tutorName,
        goalId: goalId, // Required for generateQuestions function
        subject: booking.subject,
        topic: booking.topic || 'General',
        date: booking.date,
        duration: 60, // Default 1 hour session
        status: 'completed',
        createdAt: Timestamp.now(),
        conversation: conversation, // Array format for display
        transcript: transcript, // String format for Firebase Cloud Function analysis
      };

      const sessionRef = await addDoc(collection(db, 'sessions'), sessionData);
      
      console.log(`✅ Fake session created with ID: ${sessionRef.id}`);
      console.log(`🔄 Firebase Cloud Functions will now analyze transcript and generate practice questions...`);
      alert('✅ AI-generated session created! Firebase is analyzing and creating practice questions...');
    } catch (error) {
      console.error('Error generating fake session:', error);
      alert(`Failed to generate fake session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Note: Conversations are now generated by OpenAI via Firebase Cloud Function
  // This ensures realistic, subject-specific content for ANY subject (Math, English, Science, History, etc.)

  // Note: AI analysis and practice questions are now generated automatically by Firebase Cloud Functions
  // - processTranscript: Analyzes the transcript field
  // - generateQuestions: Creates practice questions based on analysis

  if (loading) {
    return (
      <div className="tutor-dashboard">
        <header className="tutor-header">
          <h1>📚 Tutor Dashboard</h1>
          <Navigation />
        </header>
        <main className="tutor-main">
          <p>Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="tutor-dashboard">
      <header className="tutor-header">
        <h1>📚 Tutor Dashboard</h1>
        <Navigation />
      </header>
      <main className="tutor-main">
        <div className="tutor-content">
          {/* All Bookings Section (Pending + Accepted) */}
          <div className="bookings-section">
            <h2>📋 Booking Requests</h2>
            {pendingBookings.length === 0 ? (
              <div className="empty-state">
                <p>No booking requests at the moment.</p>
              </div>
            ) : (
              <div className="bookings-grid">
                {pendingBookings.map(booking => {
                  const bookingDate = booking.date?.toDate?.();
                  const student = students[booking.studentId];
                  const isAccepted = booking.status === 'accepted';
                  
                  return (
                    <div key={booking.id} className={`booking-card ${isAccepted ? 'accepted' : 'pending'}`}>
                      <div className="booking-header">
                        <div className={`booking-status-badge ${isAccepted ? 'accepted' : 'pending'}`}>
                          {isAccepted ? '✅ Accepted' : '⏳ Pending'}
                        </div>
                        <button
                          className="remove-booking-button"
                          onClick={() => handleRemoveBooking(booking.id)}
                          title="Remove booking"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="booking-body">
                        <div className="booking-info">
                          <div className="booking-field">
                            <span className="field-label">Student:</span>
                            <span className="field-value">{student?.name || 'Unknown Student'}</span>
                          </div>
                          <div className="booking-field">
                            <span className="field-label">Subject:</span>
                            <span className="field-value subject-value">{booking.subject}</span>
                          </div>
                          {booking.topic && booking.topic !== 'General' && booking.topic.trim() !== '' && (
                            <div className="booking-field">
                              <span className="field-label">Specific Topic:</span>
                              <span className="field-value topic">{booking.topic}</span>
                            </div>
                          )}
                          <div className="booking-field">
                            <span className="field-label">Date & Time:</span>
                            <span className="field-value date">
                              {bookingDate?.toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                              {' at '}
                              {bookingDate?.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                        {!isAccepted ? (
                          <button
                            className="accept-button"
                            onClick={() => handleAcceptBooking(booking)}
                          >
                            ✅ Accept & Create Appointment
                          </button>
                        ) : (
                          <button
                            className="generate-session-button"
                            onClick={() => handleGenerateFakeSession(booking)}
                          >
                            🎭 Generate Fake Session
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default TutorDashboard;

