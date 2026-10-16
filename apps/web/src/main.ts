import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { configureApiClient } from './services/api/client'
import './style.css'
import { useAuthStore } from './stores/auth'
import { useCircuitStore } from './stores/circuit'
import { circuitsApi } from './services/api/circuits'

const pinia=createPinia(),auth=useAuthStore(pinia)
useCircuitStore(pinia).attachExecutionPresentation(circuitsApi.physicalPreview)
configureApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL || '/api',csrfToken:()=>auth.csrfToken,onAuthenticationLost:()=>auth.authenticationLost() })
createApp(App).use(pinia).use(router).mount('#app')
