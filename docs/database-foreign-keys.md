# Foreign Key Cascade Policy

**Last Updated**: 2025-10-14
**Purpose**: Document and standardize foreign key behaviors across the database

## Policy Overview

This document defines the foreign key CASCADE behavior policy for all tables in the database.

## Cascade Behavior Standards

### User Deletion → CASCADE EVERYTHING ✅
**Policy**: When a user is deleted, ALL user-owned data must be removed.

**Rationale**: Users own all their data. GDPR compliance requires complete data removal.

**Tables Affected**:
- `userChatUsage` - CASCADE (user owns usage records)
- `chatThread` - CASCADE (user owns threads)
- `chatCustomRole` - CASCADE (user owns custom roles)
- `stripeCustomer` - CASCADE (user owns customer record)

### Participant Deletion → CASCADE Messages ✅
**Policy**: When a chat participant is removed, delete all their messages.

**Rationale**: Messages without participant context lose meaning. Preserving orphaned messages creates data integrity issues.

**Tables Affected**:
- `chatMessage.participantId` - CASCADE (messages belong to participants)

**Note**: Current implementation uses SET NULL. **Recommended change**: Update to CASCADE.

### Custom Role Deletion → SET NULL ✅ (Correct)
**Policy**: When a custom role is deleted, preserve participants but clear the role reference.

**Rationale**: Participants have inline role definitions in `settings.systemPrompt`. The customRoleId is optional metadata.

**Tables Affected**:
- `chatParticipant.customRoleId` - SET NULL (preserve participant with inline role)

### Subscription Deletion → SET NULL ✅ (Correct)
**Policy**: When a subscription is deleted, preserve historical invoices.

**Rationale**: Invoices are financial records that must be retained for accounting/auditing purposes.

**Tables Affected**:
- `stripeInvoice.subscriptionId` - SET NULL (preserve invoice history)

### Thread Deletion → CASCADE Children ✅
**Policy**: When a thread is deleted, remove all child records.

**Rationale**: Child records (messages, participants, changelog, analyses) have no meaning without their parent thread.

**Tables Affected**:
- `chatMessage.threadId` - CASCADE
- `chatParticipant.threadId` - CASCADE
- `chatThreadChangelog.threadId` - CASCADE
- `chatModeratorAnalysis.threadId` - CASCADE

## Complete Foreign Key Audit

### Auth Tables
| Table | Column | References | ON DELETE | ON UPDATE | Status |
|-------|--------|------------|-----------|-----------|--------|
| `user` | `invitee` | `user.id` | SET NULL | NO ACTION | ✅ Correct |
| `session` | `userId` | `user.id` | CASCADE | NO ACTION | ✅ Correct |
| `account` | `userId` | `user.id` | CASCADE | NO ACTION | ✅ Correct |
| `verification` | `identifier` | N/A | N/A | N/A | ✅ No FK |
| `apiKey` | `userId` | `user.id` | CASCADE | NO ACTION | ✅ Correct |

### Billing Tables
| Table | Column | References | ON DELETE | ON UPDATE | Status |
|-------|--------|------------|-----------|-----------|--------|
| `stripePrice` | `productId` | `stripeProduct.id` | CASCADE | NO ACTION | ✅ Correct |
| `stripeCustomer` | `userId` | `user.id` | CASCADE | NO ACTION | ✅ Correct |
| `stripeSubscription` | `customerId` | `stripeCustomer.id` | CASCADE | NO ACTION | ✅ Correct |
| `stripeSubscription` | `userId` | `user.id` | CASCADE | NO ACTION | ✅ Correct |
| `stripeSubscription` | `priceId` | `stripePrice.id` | CASCADE | NO ACTION | ✅ Correct |
| `stripePaymentMethod` | `customerId` | `stripeCustomer.id` | CASCADE | NO ACTION | ✅ Correct |
| `stripeInvoice` | `customerId` | `stripeCustomer.id` | CASCADE | NO ACTION | ✅ Correct |
| `stripeInvoice` | `subscriptionId` | `stripeSubscription.id` | SET NULL | NO ACTION | ✅ Correct |

### Chat Tables
| Table | Column | References | ON DELETE | ON UPDATE | Status |
|-------|--------|------------|-----------|-----------|--------|
| `chatThread` | `userId` | `user.id` | CASCADE | NO ACTION | ✅ Correct |
| `chatCustomRole` | `userId` | `user.id` | CASCADE | NO ACTION | ✅ Correct |
| `chatParticipant` | `threadId` | `chatThread.id` | CASCADE | NO ACTION | ✅ Correct |
| `chatParticipant` | `customRoleId` | `chatCustomRole.id` | SET NULL | NO ACTION | ✅ Correct |
| `chatMessage` | `threadId` | `chatThread.id` | CASCADE | NO ACTION | ✅ Correct |
| `chatMessage` | `participantId` | `chatParticipant.id` | SET NULL | NO ACTION | ⚠️ **SHOULD BE CASCADE** |
| `chatThreadChangelog` | `threadId` | `chatThread.id` | CASCADE | NO ACTION | ✅ Correct |
| `chatModeratorAnalysis` | `threadId` | `chatThread.id` | CASCADE | NO ACTION | ✅ Correct |

### Usage Tables
| Table | Column | References | ON DELETE | ON UPDATE | Status |
|-------|--------|------------|-----------|-----------|--------|
| `userChatUsage` | `userId` | `user.id` | CASCADE | NO ACTION | ✅ Correct |
| `userChatUsageHistory` | `userId` | `user.id` | CASCADE | NO ACTION | ✅ Correct |

## Recommended Changes

### ⚠️ Priority: chatMessage.participantId

**Current**: SET NULL
**Recommended**: CASCADE

**SQL Migration**:
```sql
-- Drop existing foreign key
ALTER TABLE chat_message DROP CONSTRAINT chat_message_participant_id_chat_participant_id_fk;

-- Recreate with CASCADE
ALTER TABLE chat_message
ADD CONSTRAINT chat_message_participant_id_chat_participant_id_fk
FOREIGN KEY (participant_id) REFERENCES chat_participant(id) ON DELETE CASCADE;
```

**Drizzle Schema Update**:
```typescript
// src/db/tables/chat.ts
participantId: text('participant_id')
  .references(() => chatParticipant.id, { onDelete: 'cascade' }), // Changed from 'set null'
```

**Impact**: When a participant is removed, all their messages are deleted. This is the correct behavior because:
1. Messages without participant context are meaningless
2. Prevents orphaned data
3. Maintains referential integrity

## Testing Checklist

After implementing CASCADE changes:

- [ ] Test user deletion removes all associated data
- [ ] Test thread deletion cascades to messages, participants, changelog
- [ ] Test participant deletion now cascades to messages (NEW BEHAVIOR)
- [ ] Test custom role deletion preserves participants (SET NULL still works)
- [ ] Test subscription deletion preserves invoices (SET NULL still works)
- [ ] Verify no orphaned records after cascading deletes

## References

- Database schema: `/src/db/tables/`
- Migration files: `/src/db/migrations/`
- Drizzle ORM foreign key docs: https://orm.drizzle.team/docs/relations
