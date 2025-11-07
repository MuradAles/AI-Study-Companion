import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Create or update learning path when a session is processed
 * This function creates checkpoints based on session topics
 */
export const createLearningPathFromSession = functions.firestore
  .document('sessions/{sessionId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const sessionId = context.params.sessionId;

    // Only proceed if aiAnalysis exists and session is new
    if (!newData.aiAnalysis || !newData.subject || !newData.studentId) {
      return null;
    }

    const studentId = newData.studentId;
    const subject = newData.subject;
    const topicsCovered = newData.aiAnalysis.topicsCovered || [];

    if (topicsCovered.length === 0) {
      console.log(`No topics found in session ${sessionId}`);
      return null;
    }

    try {
      const db = admin.firestore();
      // Normalize subject name for pathId (lowercase, replace spaces with hyphens)
      const normalizedSubject = subject.toLowerCase().replace(/\s+/g, '-');
      const pathId = `path-${normalizedSubject}-${studentId}`;
      const pathRef = db.collection('learning_paths').doc(pathId);

      // Check if path exists
      const pathDoc = await pathRef.get();

      if (!pathDoc.exists) {
        // Create new learning path
        const firstCheckpoint = {
          id: `cp-${Date.now()}`,
          order: 1,
          unlocked: true,
          completed: false,
          nodeType: 'combat',
          position: { x: 100, y: 200 },
          connections: [],
          topics: topicsCovered,
          sessionId: sessionId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await pathRef.set({
          pathId,
          studentId,
          subject,
          currentCheckpointId: firstCheckpoint.id,
          checkpoints: [firstCheckpoint],
          progress: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`Created new learning path ${pathId} for subject ${subject}`);
      } else {
        // Add new checkpoint to existing path
        const pathData = pathDoc.data();
        const existingCheckpoints = pathData?.checkpoints || [];
        const lastCheckpoint = existingCheckpoints[existingCheckpoints.length - 1];
        
        const newCheckpoint = {
          id: `cp-${Date.now()}`,
          order: lastCheckpoint ? lastCheckpoint.order + 1 : 1,
          unlocked: false, // Will be unlocked when previous checkpoint is completed
          completed: false,
          nodeType: 'combat',
          position: {
            x: 100 + (lastCheckpoint ? lastCheckpoint.order + 1 : 1) * 200,
            y: 180 + Math.random() * 40, // Slight vertical variation
          },
          connections: [],
          topics: topicsCovered,
          sessionId: sessionId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Update last checkpoint to connect to new one
        if (lastCheckpoint) {
          existingCheckpoints[existingCheckpoints.length - 1].connections = [newCheckpoint.id];
        }

        await pathRef.update({
          checkpoints: admin.firestore.FieldValue.arrayUnion(newCheckpoint),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`Added checkpoint ${newCheckpoint.id} to path ${pathId}`);
      }

      return null;
    } catch (error) {
      console.error(`Error creating learning path for session ${sessionId}:`, error);
      throw error;
    }
  });

