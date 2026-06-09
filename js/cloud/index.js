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
  recordReferral,
  getMyReferralCount,
  getMyReferrals,
  generateInviteLink,
  getCardByNfcId,
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
  disableEmployeeCard,
  enableEmployeeCard,
  updateNfcStatus,
  transferNfcCard,
  createCardInvite,
  claimCardInvite,
  getCardInvites
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

  startLineLogin,
  finishLineLoginFromUrl,
  lineAuthDiag,

  hasLiffConfig,
  isInLiffBrowser,
  initLiff,
  liffAutoLogin,

  hasGoogleConfig,
  startGoogleLogin,
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

  recordReferral,
  getMyReferralCount,
  getMyReferrals,
  generateInviteLink,

  getCardByNfcId,
  setNfcCardId,

  isAdmin,
  getAdminUsers,
  upsertAdminUser,
  deleteAdminUser,
  adminUpdateCard,
  disableEmployeeCard,
  enableEmployeeCard,
  updateNfcStatus,
  transferNfcCard,
  createCardInvite,
  claimCardInvite,
  getCardInvites,

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
