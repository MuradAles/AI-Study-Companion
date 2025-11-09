import React, { useState, useEffect } from 'react';
import { collection, addDoc, Timestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import './BookMeetingModal.css';

interface Booking {
  id: string;
  tutorName: string;
  subject: string;
  topic: string;
  date: any;
  status: string;
}

interface BookMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  tutorName?: string;
  existingBooking?: Booking;
}

function BookMeetingModal({ isOpen, onClose, tutorName, existingBooking }: BookMeetingModalProps) {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Initialize form with existing booking data
  useEffect(() => {
    if (existingBooking && isOpen) {
      const bookingDate = existingBooking.date?.toDate?.();
      if (bookingDate) {
        setSelectedDate(bookingDate.toISOString().split('T')[0]);
        // Extract time in HH:mm format
        const hours = bookingDate.getHours().toString().padStart(2, '0');
        const minutes = bookingDate.getMinutes().toString().padStart(2, '0');
        setSelectedTime(`${hours}:${minutes}`);
      }
      if (existingBooking.subject) {
        setSubject(existingBooking.subject);
      }
      if (existingBooking.topic) {
        setTopic(existingBooking.topic);
      }
    } else if (isOpen) {
      // Reset form when opening without existing booking
      setSelectedDate('');
      setSelectedTime('');
      setSubject('');
      setTopic('');
    }
  }, [existingBooking, isOpen]);

  // Get today's date in YYYY-MM-DD format for min date
  const today = new Date().toISOString().split('T')[0];
  
  // Get date 30 days from now for max date
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  // No topic options - user enters free text

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) {
      setError('You must be signed in to book a meeting');
      return;
    }

    if (!selectedDate) {
      setError('Please select a date');
      return;
    }

    if (!selectedTime) {
      setError('Please select a time');
      return;
    }

    if (!subject.trim()) {
      setError('Please enter what you need help with (e.g., Algebra, SAT, Calculus)');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Combine date and time into a single Date object
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const dateTime = new Date(selectedDate);
      dateTime.setHours(hours, minutes, 0, 0);

      if (existingBooking) {
        // Update existing booking
        const bookingRef = doc(db, 'booking_requests', existingBooking.id);
        await updateDoc(bookingRef, {
          subject: subject.trim(),
          topic: topic.trim() || 'General',
          date: Timestamp.fromDate(dateTime),
          updatedAt: Timestamp.now(),
        });
      } else {
        // Create new booking
        const bookingData = {
          studentId: currentUser.uid,
          tutorName: '', // Will be assigned when tutor accepts
          subject: subject.trim(),
          topic: topic.trim() || 'General',
          date: Timestamp.fromDate(dateTime),
          status: 'pending', // pending -> accepted when tutor claims it
          createdAt: Timestamp.now(),
        };

        await addDoc(collection(db, 'booking_requests'), bookingData);
      }
      
      setSuccess(true);
      
      // Close modal after 2 seconds
      setTimeout(() => {
        setSuccess(false);
        onClose();
        // Reset form
        setSelectedDate('');
        setSelectedTime('');
        setSubject('');
        setTopic('');
      }, 2000);
    } catch (error: any) {
      setError(error.message || 'Failed to book meeting. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null);
      setSuccess(false);
      setSelectedDate('');
      setSelectedTime('');
      setSubject('');
      setTopic('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{existingBooking ? '📅 Edit Meeting' : '📅 Book a Meeting'}</h2>
          <button className="modal-close" onClick={handleClose} disabled={isSubmitting}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="booking-form">
          {existingBooking && (
            <div className="existing-booking-info">
              <p className="existing-booking-label">📅 Current Booking:</p>
              <p className="existing-booking-date">
                {existingBooking.date?.toDate?.().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
          )}

          {tutorName && (
            <div className="form-info">
              <p><strong>Tutor:</strong> {tutorName}</p>
            </div>
          )}

          {subject && (
            <div className="form-info">
              <p><strong>Subject:</strong> {subject}</p>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="meeting-date">Select Date *</label>
              <input
                id="meeting-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={today}
                max={maxDateStr}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="meeting-time">Select Time *</label>
              <input
                id="meeting-time"
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="meeting-subject">What do you need help with? *</label>
            <input
              id="meeting-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Algebra, SAT, Calculus, Geometry..."
              required
              disabled={isSubmitting}
            />
            <small className="form-hint">
              Enter the main subject (e.g., Math, English, SAT Prep)
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="meeting-topic">Specific topic (optional)</label>
            <input
              id="meeting-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., quadratic equations, essay writing..."
              disabled={isSubmitting}
            />
            <small className="form-hint">
              Add specific details about what you need help with
            </small>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {success && (
            <div className="success-message">
              ✅ Meeting booked successfully!
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="cancel-button"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedDate || !selectedTime || !subject.trim()}
              className="submit-button"
            >
              {isSubmitting 
                ? (existingBooking ? 'Updating...' : 'Booking...') 
                : (existingBooking ? 'Update Meeting' : 'Book Meeting')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BookMeetingModal;

