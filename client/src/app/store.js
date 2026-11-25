import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import techniciansReducer from '../features/technicians/techniciansSlice';
import bookingsReducer from '../features/bookings/bookingsSlice';
import uiReducer, { applyUi } from '../features/ui/uiSlice';
import { installResponseInterceptor } from '../api/axios';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    technicians: techniciansReducer,
    bookings: bookingsReducer,
    ui: uiReducer,
  },
});

// The 401 interceptor needs the store to dispatch logout; wiring it here
// avoids a circular import between api and the store.
installResponseInterceptor(store);

applyUi(store.getState().ui);
store.subscribe(() => applyUi(store.getState().ui));
