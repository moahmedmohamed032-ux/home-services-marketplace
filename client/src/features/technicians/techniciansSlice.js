import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorMessage } from '../../api/axios';

const initialState = {
  professions: [],
  cities: [],
  list: [],
  current: null,
  filters: { profession: '', city: '', search: '' },
  status: 'idle',
  error: null,
};

export const fetchProfessions = createAsyncThunk('technicians/fetchProfessions', async () => {
  const { data } = await api.get('/professions');
  return data.professions;
});

export const fetchCities = createAsyncThunk('technicians/fetchCities', async () => {
  const { data } = await api.get('/professions/meta/cities');
  return data.cities;
});

export const fetchTechnicians = createAsyncThunk(
  'technicians/fetchTechnicians',
  async (filters, { rejectWithValue }) => {
    try {
      const params = {};
      for (const [k, v] of Object.entries(filters || {})) if (v) params[k] = v;
      const { data } = await api.get('/technicians', { params });
      return data.technicians;
    } catch (err) {
      return rejectWithValue(errorMessage(err, 'Could not load technicians'));
    }
  }
);

export const fetchTechnician = createAsyncThunk(
  'technicians/fetchTechnician',
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/technicians/${id}`);
      return data.technician;
    } catch (err) {
      return rejectWithValue(errorMessage(err, 'Could not load technician'));
    }
  }
);

export const updateMyProfile = createAsyncThunk(
  'technicians/updateMyProfile',
  async (patch, { rejectWithValue }) => {
    try {
      const { data } = await api.patch('/technicians/me', patch);
      return data.technician;
    } catch (err) {
      return rejectWithValue(errorMessage(err, 'Could not update profile'));
    }
  }
);

const techniciansSlice = createSlice({
  name: 'technicians',
  initialState,
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfessions.fulfilled, (state, action) => {
        state.professions = action.payload;
      })
      .addCase(fetchCities.fulfilled, (state, action) => {
        state.cities = action.payload;
      })
      .addCase(fetchTechnicians.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchTechnicians.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.list = action.payload;
      })
      .addCase(fetchTechnicians.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(fetchTechnician.fulfilled, (state, action) => {
        state.current = action.payload;
      })
      .addCase(updateMyProfile.fulfilled, (state, action) => {
        state.current = action.payload;
      });
  },
});

export const { setFilters } = techniciansSlice.actions;
export default techniciansSlice.reducer;
