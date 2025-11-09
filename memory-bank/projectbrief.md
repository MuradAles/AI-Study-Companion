# Project Brief: AI Study Companion

## Overview

**Project Name:** AI Study Companion  
**Version:** 1.0  
**Current Phase:** Feature Complete - Chat System Enhancement  
**Last Updated:** January 2025

## Mission Statement

Build an AI-powered study companion that lives between tutoring sessions to prevent student churn, drive cross-selling, and improve learning outcomes. The companion analyzes session transcripts, generates personalized practice questions, tracks progress across multiple subjects, and uses gamification to maintain engagement.

## Business Problem

The tutoring platform faces critical retention challenges:

- **52% of students churn** after completing their primary goal (e.g., passing SAT)
- Students don't realize the platform can help with other subjects
- Low engagement between tutoring sessions
- Students with <3 sessions in first week have poor retention

## Success Metrics

### Primary Goals
- Reduce "goal complete" churn from 52% to <30%
- Increase cross-subject enrollment by 25%
- 60% of students complete daily practice goals
- Students with <3 sessions in week 1 book additional sessions

### Secondary Metrics
- Daily practice completion: 60%
- Average streak length: 5 days
- Chat usage: 40% weekly
- Notification CTR: >15%

## Core Value Proposition

1. **Prevents Churn:** Keeps students engaged between sessions with personalized practice
2. **Drives Cross-Selling:** Intelligently suggests new subjects when goals complete
3. **Improves Outcomes:** Adaptive practice questions based on actual session content
4. **Builds Habits:** Gamification system encourages daily engagement

## Target Users

Primary: Students enrolled in tutoring sessions who need practice between sessions  
Secondary: Tutoring platform administrators tracking student engagement metrics

## Timeline

**Current Phase:** Feature Complete - Chat System Enhancement  
**Recent Work:** Chat PRD implementation (session-based clarification chat with practice question generation)  
**Future Phases:** 90-day roadmap with scaling and optimization milestones

## Key Constraints

- Must integrate with existing tutoring session infrastructure
- Cost optimization critical (target: ~$2,500/month with 3,000 students)
- Must maintain student privacy and data security
- Real-time updates required for gamification to feel responsive
- Chat questions do NOT count toward gamification (only practice page questions)

## Project Scope

### In Scope (MVP - Complete)
- ✅ Session transcript analysis and AI-powered question generation
- ✅ Practice interface with immediate feedback
- ✅ AI chat companion with session context (clarification-focused)
- ✅ Practice question generation in chat (always new, multiple choice)
- ✅ Learning Tree visualization (radial tree with D3.js)
- ✅ On-demand question generation (always 3 questions per difficulty)
- ✅ Question solving within learning tree
- ✅ Subject progress tracking with circular progress bars
- ✅ Gamification system (points, levels, badges, streaks)
- ✅ Multi-subject progress tracking
- ✅ Retention automation (notifications, cross-sell suggestions)
- ✅ Session-based cross-sell suggestions

### Current Enhancement Focus
- Chat system improvements per PRD:
  - Session-based clarification chat (✅ implemented)
  - Practice question generation in chat (✅ implemented)
  - Multiple choice format (4 options A-D) (✅ implemented)
  - Session-based cross-sell suggestions (✅ implemented)
  - Conversation persistence (✅ implemented)

### Out of Scope (Future)
- Mobile native app (planned for Month 2)
- Video explanations (planned for Month 2)
- Parent dashboard (planned for Month 2)
- Voice-based interaction (beyond 90 days)
- AR/VR experiences (beyond 90 days)

## Success Criteria

MVP is considered successful if:
1. ✅ All core features functional and deployed
2. ✅ Demo account created with sample data
3. ✅ Documentation complete
4. ⏳ Cost analysis validates business model
5. ⏳ 90-day roadmap documented

## Key Principles

1. **Session-Based Context:** Everything references student's actual sessions, not generic knowledge
2. **Chat for Clarification:** Chat is primarily for understanding session content
3. **Always Generate New:** Chat practice questions are always freshly generated, never from practice_items
4. **Gamification Separation:** Chat questions show visual feedback only, no points/levels/badges
5. **Personalized Cross-Sell:** Suggestions based on actual session history, not hardcoded mappings
