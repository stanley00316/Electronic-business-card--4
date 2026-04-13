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
  deleteCard,
  getAdminUsers,
  upsertAdminUser,
  deleteAdminUser,
  adminUpdateCard
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

// #region agent log
// Debug: log document encoding after cloud bundle loads (UTF-8 verification)
(function () {
  try {
    var meta = document.querySelector('meta[charset]');
    var t = document.title || '';
    var hasReplacement = t.indexOf('\uFFFD') >= 0;
    fetch('http://127.0.0.1:7665/ingest/1c4657e8-8c04-4e63-85b8-af5c9905415e', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Debug-Session-Id': 'a5a55e'
      },
      body: JSON.stringify({
        sessionId: 'a5a55e',
        location: 'js/cloud/index.js:encoding-boot',
        message: 'UTF-8 runtime probe（cloud 載入後）',
        data: {
          characterSet: document.characterSet,
          compatMode: document.compatMode,
          metaCharset: meta ? meta.getAttribute('charset') : null,
          href: String(location.href),
          hasReplacementInTitle: hasReplacement,
          titleSampleCodePoints: Array.from(t.slice(0, 12)).map(function (ch) {
            return 'U+' + ch.codePointAt(0).toString(16).toUpperCase();
          })
        },
        timestamp: Date.now(),
        hypothesisId: 'H1-H4-H5',
        runId: 'post-fix'
      })
    }).catch(function () {});
  } catch (_e) {}
})();
// #endregion
