import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import techniciansReducer from '../features/technicians/techniciansSlice';
import bookingsReducer from '../features/bookings/bookingsSlice';
import { installResponseInterceptor } from '../api/axios';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    technicians: techniciansReducer,
    bookings: bookingsReducer,
  },
});

// The 401 interceptor needs the store to dispatch logout; wiring it here
// avoids a circular import between api and the store.
installResponseInterceptor(store);
