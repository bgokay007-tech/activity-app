import api from './api';

export const searchCourts = (city, sport) =>
    api.get('/courts/search', { params: { city, sport } }).then(r => r.data);

export const addCourt = (data) =>
    api.post('/courts', data).then(r => r.data);
