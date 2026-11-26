import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

import { logout, type OniUser } from '@/services/auth';
import { syncTokenCookie } from '@/services/tokenCookie';

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false);
  const loginTermsUrl = ref<string>();
  const user = ref<OniUser>();

  watch(user, syncTokenCookie, { flush: 'sync', immediate: true });

  const reset = () => {
    isLoggedIn.value = false;
    loginTermsUrl.value = undefined;
    user.value = undefined;
  };

  const dologout = async () => {
    user.value = undefined;
    isLoggedIn.value = false;

    logout();
  };

  return { isLoggedIn, loginTermsUrl, user, reset, logout: dologout };
});
