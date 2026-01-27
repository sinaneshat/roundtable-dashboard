import { relations } from 'drizzle-orm/relations';

import { account, apiKey, automatedJob, chatCustomRole, chatMessage, chatParticipant, chatPreSearch, chatProject, chatThread, chatThreadChangelog, chatUserPreset, creditTransaction, messageUpload, projectAttachment, projectMemory, session, stripeCustomer, stripeInvoice, stripePaymentMethod, stripePrice, stripeProduct, stripeSubscription, threadUpload, upload, user, userChatUsage, userChatUsageHistory, userCreditBalance } from './schema';

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  apiKeys: many(apiKey),
  sessions: many(session),
  stripeCustomers: many(stripeCustomer),
  stripeSubscriptions: many(stripeSubscription),
  chatCustomRoles: many(chatCustomRole),
  chatThreads: many(chatThread),
  chatUserPresets: many(chatUserPreset),
  creditTransactions: many(creditTransaction),
  userCreditBalances: many(userCreditBalance),
  chatProjects: many(chatProject),
  projectAttachments: many(projectAttachment),
  projectMemories: many(projectMemory),
  uploads: many(upload),
  userChatUsages: many(userChatUsage),
  userChatUsageHistories: many(userChatUsageHistory),
  automatedJobs: many(automatedJob),
}));

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  user: one(user, {
    fields: [apiKey.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const stripeCustomerRelations = relations(stripeCustomer, ({ one, many }) => ({
  user: one(user, {
    fields: [stripeCustomer.userId],
    references: [user.id],
  }),
  stripeInvoices: many(stripeInvoice),
  stripePaymentMethods: many(stripePaymentMethod),
  stripeSubscriptions: many(stripeSubscription),
}));

export const stripeInvoiceRelations = relations(stripeInvoice, ({ one }) => ({
  stripeSubscription: one(stripeSubscription, {
    fields: [stripeInvoice.subscriptionId],
    references: [stripeSubscription.id],
  }),
  stripeCustomer: one(stripeCustomer, {
    fields: [stripeInvoice.customerId],
    references: [stripeCustomer.id],
  }),
}));

export const stripeSubscriptionRelations = relations(stripeSubscription, ({ one, many }) => ({
  stripeInvoices: many(stripeInvoice),
  stripePrice: one(stripePrice, {
    fields: [stripeSubscription.priceId],
    references: [stripePrice.id],
  }),
  user: one(user, {
    fields: [stripeSubscription.userId],
    references: [user.id],
  }),
  stripeCustomer: one(stripeCustomer, {
    fields: [stripeSubscription.customerId],
    references: [stripeCustomer.id],
  }),
}));

export const stripePaymentMethodRelations = relations(stripePaymentMethod, ({ one }) => ({
  stripeCustomer: one(stripeCustomer, {
    fields: [stripePaymentMethod.customerId],
    references: [stripeCustomer.id],
  }),
}));

export const stripePriceRelations = relations(stripePrice, ({ one, many }) => ({
  stripeProduct: one(stripeProduct, {
    fields: [stripePrice.productId],
    references: [stripeProduct.id],
  }),
  stripeSubscriptions: many(stripeSubscription),
}));

export const stripeProductRelations = relations(stripeProduct, ({ many }) => ({
  stripePrices: many(stripePrice),
}));

export const chatCustomRoleRelations = relations(chatCustomRole, ({ one, many }) => ({
  user: one(user, {
    fields: [chatCustomRole.userId],
    references: [user.id],
  }),
  chatParticipants: many(chatParticipant),
}));

export const chatMessageRelations = relations(chatMessage, ({ one, many }) => ({
  chatParticipant: one(chatParticipant, {
    fields: [chatMessage.participantId],
    references: [chatParticipant.id],
  }),
  chatThread: one(chatThread, {
    fields: [chatMessage.threadId],
    references: [chatThread.id],
  }),
  messageUploads: many(messageUpload),
}));

export const chatParticipantRelations = relations(chatParticipant, ({ one, many }) => ({
  chatMessages: many(chatMessage),
  chatCustomRole: one(chatCustomRole, {
    fields: [chatParticipant.customRoleId],
    references: [chatCustomRole.id],
  }),
  chatThread: one(chatThread, {
    fields: [chatParticipant.threadId],
    references: [chatThread.id],
  }),
}));

export const chatThreadRelations = relations(chatThread, ({ one, many }) => ({
  chatMessages: many(chatMessage),
  chatParticipants: many(chatParticipant),
  chatPreSearches: many(chatPreSearch),
  chatProject: one(chatProject, {
    fields: [chatThread.projectId],
    references: [chatProject.id],
  }),
  user: one(user, {
    fields: [chatThread.userId],
    references: [user.id],
  }),
  chatThreadChangelogs: many(chatThreadChangelog),
  creditTransactions: many(creditTransaction),
  projectMemories: many(projectMemory),
  threadUploads: many(threadUpload),
  automatedJobs: many(automatedJob),
}));

export const chatPreSearchRelations = relations(chatPreSearch, ({ one }) => ({
  chatThread: one(chatThread, {
    fields: [chatPreSearch.threadId],
    references: [chatThread.id],
  }),
}));

export const chatProjectRelations = relations(chatProject, ({ one, many }) => ({
  chatThreads: many(chatThread),
  user: one(user, {
    fields: [chatProject.userId],
    references: [user.id],
  }),
  projectAttachments: many(projectAttachment),
  projectMemories: many(projectMemory),
}));

export const chatThreadChangelogRelations = relations(chatThreadChangelog, ({ one }) => ({
  chatThread: one(chatThread, {
    fields: [chatThreadChangelog.threadId],
    references: [chatThread.id],
  }),
}));

export const chatUserPresetRelations = relations(chatUserPreset, ({ one }) => ({
  user: one(user, {
    fields: [chatUserPreset.userId],
    references: [user.id],
  }),
}));

export const creditTransactionRelations = relations(creditTransaction, ({ one }) => ({
  chatThread: one(chatThread, {
    fields: [creditTransaction.threadId],
    references: [chatThread.id],
  }),
  user: one(user, {
    fields: [creditTransaction.userId],
    references: [user.id],
  }),
}));

export const userCreditBalanceRelations = relations(userCreditBalance, ({ one }) => ({
  user: one(user, {
    fields: [userCreditBalance.userId],
    references: [user.id],
  }),
}));

export const projectAttachmentRelations = relations(projectAttachment, ({ one }) => ({
  user: one(user, {
    fields: [projectAttachment.addedBy],
    references: [user.id],
  }),
  upload: one(upload, {
    fields: [projectAttachment.uploadId],
    references: [upload.id],
  }),
  chatProject: one(chatProject, {
    fields: [projectAttachment.projectId],
    references: [chatProject.id],
  }),
}));

export const uploadRelations = relations(upload, ({ one, many }) => ({
  projectAttachments: many(projectAttachment),
  messageUploads: many(messageUpload),
  threadUploads: many(threadUpload),
  user: one(user, {
    fields: [upload.userId],
    references: [user.id],
  }),
}));

export const projectMemoryRelations = relations(projectMemory, ({ one }) => ({
  user: one(user, {
    fields: [projectMemory.createdBy],
    references: [user.id],
  }),
  chatThread: one(chatThread, {
    fields: [projectMemory.sourceThreadId],
    references: [chatThread.id],
  }),
  chatProject: one(chatProject, {
    fields: [projectMemory.projectId],
    references: [chatProject.id],
  }),
}));

export const messageUploadRelations = relations(messageUpload, ({ one }) => ({
  upload: one(upload, {
    fields: [messageUpload.uploadId],
    references: [upload.id],
  }),
  chatMessage: one(chatMessage, {
    fields: [messageUpload.messageId],
    references: [chatMessage.id],
  }),
}));

export const threadUploadRelations = relations(threadUpload, ({ one }) => ({
  upload: one(upload, {
    fields: [threadUpload.uploadId],
    references: [upload.id],
  }),
  chatThread: one(chatThread, {
    fields: [threadUpload.threadId],
    references: [chatThread.id],
  }),
}));

export const userChatUsageRelations = relations(userChatUsage, ({ one }) => ({
  user: one(user, {
    fields: [userChatUsage.userId],
    references: [user.id],
  }),
}));

export const userChatUsageHistoryRelations = relations(userChatUsageHistory, ({ one }) => ({
  user: one(user, {
    fields: [userChatUsageHistory.userId],
    references: [user.id],
  }),
}));

export const automatedJobRelations = relations(automatedJob, ({ one }) => ({
  chatThread: one(chatThread, {
    fields: [automatedJob.threadId],
    references: [chatThread.id],
  }),
  user: one(user, {
    fields: [automatedJob.userId],
    references: [user.id],
  }),
}));
