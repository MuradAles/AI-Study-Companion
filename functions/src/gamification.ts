// Gamification utilities
export function calculateLevel(points: number): number {
  const levels = [0, 100, 250, 500, 1000, 2000, 4000, 8000];
  const levelIndex = levels.findIndex(threshold => points < threshold);
  // If levelIndex === -1, points >= 8000, return level 8
  // If levelIndex === 0, points < 0 (shouldn't happen), return level 1
  // Otherwise, levelIndex is the level number (1-based)
  if (levelIndex === -1) return 8;
  if (levelIndex === 0) return 1;
  return levelIndex;
}

export function isDateConsecutive(date1: string, date2: string): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

export interface Badge {
  badgeId: string;
  emoji: string;
  name: string;
  earnedAt: string;
}

export async function checkForNewBadges(
  student: any,
  action: {
    answeredQuestion?: boolean;
    isCorrect?: boolean;
    dailyProgress?: number;
    newStreak?: number;
  }
): Promise<Badge[]> {
  const newBadges: Badge[] = [];
  const existingBadgeIds = (student.gamification?.badges || []).map((b: Badge) => b.badgeId);
  const today = new Date().toISOString().split('T')[0];

  // First Answer badge
  if (action.answeredQuestion && !existingBadgeIds.includes('first_answer')) {
    const totalQuestions = (student.practiceItems || []).reduce((sum: number, item: any) => {
      return sum + (item.responses || []).length;
    }, 0);
    if (totalQuestions === 1) {
      newBadges.push({
        badgeId: 'first_answer',
        emoji: '✨',
        name: 'First Answer',
        earnedAt: today,
      });
    }
  }

  // Streak badges
  if (action.newStreak) {
    if (action.newStreak === 3 && !existingBadgeIds.includes('three_day_streak')) {
      newBadges.push({
        badgeId: 'three_day_streak',
        emoji: '🔥',
        name: 'On Fire',
        earnedAt: today,
      });
    }
    if (action.newStreak === 7 && !existingBadgeIds.includes('seven_day_streak')) {
      newBadges.push({
        badgeId: 'seven_day_streak',
        emoji: '💪',
        name: 'Dedicated',
        earnedAt: today,
      });
    }
    if (action.newStreak === 30 && !existingBadgeIds.includes('thirty_day_streak')) {
      newBadges.push({
        badgeId: 'thirty_day_streak',
        emoji: '🏆',
        name: 'Unstoppable',
        earnedAt: today,
      });
    }
  }

  // Perfect Day badge
  if (action.dailyProgress === 3 && action.isCorrect && !existingBadgeIds.includes('perfect_day')) {
    // Check if all answers today were correct
    // This would need to be checked from practice items
    // For now, simplified logic
    newBadges.push({
      badgeId: 'perfect_day',
      emoji: '💯',
      name: 'Perfect Day',
      earnedAt: today,
    });
  }

  return newBadges;
}

