import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorMessage } from '../../api/axios';

const initialState = {
  mine: [],
  incoming: [],
  status: 'idle',
  error: null,
};

export const createBooking = createAsyncThunk(
  'bookings/create',
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/bookings', payload);
      return data.booking;
    } catch (err) {
      return rejectWithValue(errorMessage(err, 'Booking failed'));
    }
  }
);

export const fetchMyBookings = createAsyncThunk('bookings/fetchMine', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/bookings/mine');
    return data.bookings;
  } catch (err) {
    return rejectWithValue(errorMessage(err, 'Could not load bookings'));
  }
});

export const fetchIncomingBookings = createAsyncThunk(
  'bookings/fetchIncoming',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/bookings/incoming');
      return data.bookings;
    } catch (err) {
      return rejectWithValue(errorMessage(err, 'Could not load requests'));
    }
  }
);

export const updateBookingStatus = createAsyncThunk(
  'bookings/updateStatus',
  async ({ id, status }, { rejectWithValue }) => {
    try {
      const { data } = await api.patch(`/bookings/${id}/status`, { status });
      return data.booking;
    } catch (err) {
      return rejectWithValue(errorMessage(err, 'Could not update booking'));
    }
  }
);

export const reviewBooking = createAsyncThunk(
  'bookings/review',
  async ({ id, rating, comment }, { rejectWithValue }) => {
    try {
      const { data } = await api.post(`/bookings/${id}/review`, { rating, comment });
      return data.booking;
    } catch (err) {
      return rejectWithValue(errorMessage(err, 'Could not submit review'));
    }
  }
);

function replaceBooking(list, booking) {
  const i = list.findIndex((b) => b.id === booking.id);
  if (i >= 0) list[i] = { ...list[i], ...booking };
  else list.unshift(booking);
}

const bookingsSlice = createSlice({
  name: 'bookings',
  initialState,
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyBookings.fulfilled, (state, action) => {
        state.mine = action.payload;
      })
      .addCase(fetchIncomingBookings.fulfilled, (state, action) => {
        state.incoming = action.payload;
      })
      .addCase(updateBookingStatus.fulfilled, (state, action) => {
        replaceBooking(state.mine, action.payload);
        replaceBooking(state.incoming, action.payload);
      })
      .addCase(reviewBooking.fulfilled, (state, action) => {
        replaceBooking(state.mine, action.payload);
      })
      .addCase(createBooking.fulfilled, (state, action) => {
        state.mine.unshift(action.payload);
      });
  },
});

export default bookingsSlice.reducer;
