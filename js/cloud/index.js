/**
 * 組裝 UVACO_CLOUD 公開 API（與原 cloud.js IIFE return 對齊，並補上 setCustomJwt）
 */
import { ErrorCodes } from './error-codes.js';
import {
  CloudError,
  createError,
  isAuthError,
  isNetworkError
} from './errors.js';
import {
  hasConfig,
  getBaseUrl,
  getClient,
  getPublicClient
} from './clients.js';
import { getCustomJwt, setCustomJwt, clearCustomJwt } from './jwt.js';
import {
  getSession,
  requireAuth,
  signInWithEmailOtp,
  exchangeCodeForSessionIfNeeded
} from './session.js';
import {
  getLiffLoginUrl,
  startLineAppLogin,
  startLineLogin,
  finishLineLoginFromUrl,
  lineAuthDiag,
  hasLiffConfig,
  isInLiffBrowser,
  initLiff,
  liffAutoLogin
} from './line-liff.js';
import {
  hasGoogleConfig,
  startGoogleLogin,
  startGoogleLink,
  getGoogleLinkStatus,
  finishGoogleLoginFromUrl,
  googleAuthDiag,
  hasAppleConfig,
  startAppleLogin,
  finishAppleLoginFromUrl,
  appleAuthDiag
} from './oauth-google-apple.js';
import {
  getMyCard,
  getCardByUserId,
  getCardPublic,
  recordCardView,
  getCardViewStats,
  submitLeadInquiry,
  recordReferral,
  getMyReferralCount,
  getMyReferrals,
  createGuestCardAutoApproved,
  generateInviteLink,
  getMyContacts,
  addMyContact,
  deleteMyContact,
  getMyContactById,
  getCardByNfcId,
  getVCardUrl,
  setNfcCardId
} from './cards-referrals-nfc.js';
import {
  getAllCardsAdmin,
  getCardViewSummariesForAdmin,
  deleteCard,
  getAdminUsers,
  upsertAdminUser,
  deleteAdminUser,
  adminUpdateCard,
  setCardStickerOption,
  adminUploadAsset,
  adminSetLogoVectorPath,
  disableEmployeeCard,
  enableEmployeeCard,
  updateNfcStatus,
  transferNfcCard,
  batchUpdateEmployeeCards,
  createCardInvite,
  claimCardInvite,
  getCardInvitePublic,
  getCardInvites,
  saveCompanySettings,
  getCompanySettings,
  getLeadInquiriesAdmin,
  updateLeadInquiryStatus
} from './admin-operations.js';
import { searchCards, uploadMyAsset, getSignedAssetUrl, upsertMyCard } from './search-storage.js';
import {
  ensureConsent,
  toCsv,
  exportCardsCsv,
  r2Diag,
  getStorageProvider
} from './compliance-export-diag.js';
import { isAdmin } from './admin-roles.js';
import {
  getMySubscription,
  createMySubscription,
  getSubscriptionEndDate,
  isSubscriptionActive,
  getAllSubscriptionsAdmin,
  extendSubscription,
  reduceSubscription,
  deactivateSubscription,
  reactivateUserSubscription,
  getPricingPlans,
  savePricingPlan,
  deletePricingPlan,
  reactivatePricingPlan,
  updateMyReferralBonus,
  createStripeCheckout,
  createLinePayCheckout
} from './subscription.js';

window.UVACO_CLOUD = {
  ErrorCodes,
  CloudError,
  createError,
  isAuthError,
  isNetworkError,

  hasConfig,
  getClient,
  getBaseUrl,
  getCustomJwt,
  setCustomJwt,
  clearCustomJwt,

  getSession,
  requireAuth,
  signInWithEmailOtp,
  exchangeCodeForSessionIfNeeded,

  getLiffLoginUrl,
  startLineAppLogin,
  startLineLogin,
  finishLineLoginFromUrl,
  lineAuthDiag,

  hasLiffConfig,
  isInLiffBrowser,
  initLiff,
  liffAutoLogin,

  hasGoogleConfig,
  startGoogleLogin,
  startGoogleLink,
  getGoogleLinkStatus,
  finishGoogleLoginFromUrl,
  googleAuthDiag,

  hasAppleConfig,
  startAppleLogin,
  finishAppleLoginFromUrl,
  appleAuthDiag,

  getMyCard,
  getCardByUserId,
  getCardPublic,
  getAllCardsAdmin,
  getCardViewSummariesForAdmin,
  searchCards,
  upsertMyCard,
  deleteCard,

  recordCardView,
  getCardViewStats,
  submitLeadInquiry,

  recordReferral,
  getMyReferralCount,
  getMyReferrals,
  createGuestCardAutoApproved,
  generateInviteLink,

  getMyContacts,
  addMyContact,
  deleteMyContact,
  getMyContactById,

  getCardByNfcId,
  getVCardUrl,
  setNfcCardId,

  isAdmin,
  getAdminUsers,
  upsertAdminUser,
  deleteAdminUser,
  adminUpdateCard,
  setCardStickerOption,
  adminUploadAsset,
  adminSetLogoVectorPath,
  disableEmployeeCard,
  enableEmployeeCard,
  updateNfcStatus,
  transferNfcCard,
  batchUpdateEmployeeCards,
  createCardInvite,
  claimCardInvite,
  getCardInvitePublic,
  getCardInvites,
  saveCompanySettings,
  getCompanySettings,
  getLeadInquiriesAdmin,
  updateLeadInquiryStatus,

  uploadMyAsset,
  getSignedAssetUrl,
  getStorageProvider,

  ensureConsent,

  r2Diag,
  exportCardsCsv,

  getMySubscription,
  createMySubscription,
  getSubscriptionEndDate,
  isSubscriptionActive,
  getAllSubscriptionsAdmin,
  extendSubscription,
  reduceSubscription,
  deactivateSubscription,
  reactivateUserSubscription,
  getPricingPlans,
  savePricingPlan,
  deletePricingPlan,
  reactivatePricingPlan,
  updateMyReferralBonus,

  createStripeCheckout,
  createLinePayCheckout
};
