import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorMessage } from '../../api/axios';

const savedToken = localStorage.getItem('fanni_token');
const savedUser = JSON.parse(localStorage.getItem('fanni_user') || 'null');

const initialState = {
  user: savedUser,
  token: savedToken,
  status: 'idle',
  error: null,
};

function persistSession(token, user) {
  localStorage.setItem('fanni_token', token);
  localStorage.setItem('fanni_user', JSON.stringify(user));
}

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials);
    return data;
  } catch (err) {
    return rejectWithValue(errorMessage(err, 'Login failed'));
  }
});

export const register = createAsyncThunk('auth/register', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/register', payload);
    return data;
  } catch (err) {
    return rejectWithValue(errorMessage(err, 'Registration failed'));
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.token = null;
      state.error = null;
      localStorage.removeItem('fanni_token');
      localStorage.removeItem('fanni_user');
    },
  },
  extraReducers: (builder) => {
    for (const thunk of [login, register]) {
      builder
        .addCase(thunk.pending, (state) => {
          state.status = 'loading';
          state.error = null;
        })
        .addCase(thunk.fulfilled, (state, action) => {
          state.status = 'succeeded';
          state.user = action.payload.user;
          state.token = action.payload.token;
          persistSession(action.payload.token, action.payload.user);
        })
        .addCase(thunk.rejected, (state, action) => {
          state.status = 'failed';
          state.error = action.payload;
        });
    }
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
