/**
 * FROM K CAR — Table API 헬퍼
 * RESTful Table API(/tables/car_listings) 래퍼
 */
(function (global) {
  const TABLE = 'car_listings';

  function authHeaders() {
    const token = global.KCarAuth && global.KCarAuth.getToken();
    return token ? { 'Authorization': 'Basic ' + token } : {};
  }

  function handleAuthFailure(res) {
    if (res.status === 401 && global.KCarAuth) {
      global.KCarAuth.clearToken();
      global.KCarAuth.showGate();
    }
  }

  async function listCars({ page = 1, limit = 100, search = '', sort = '' } = {}) {
    const params = new URLSearchParams();
    params.set('page', page);
    params.set('limit', limit);
    if (search) params.set('search', search);
    if (sort) params.set('sort', sort);
    const res = await fetch(`tables/${TABLE}?${params.toString()}`);
    if (!res.ok) throw new Error('목록을 불러오지 못했습니다.');
    return res.json();
  }

  async function getCar(id) {
    const res = await fetch(`tables/${TABLE}/${id}`);
    if (!res.ok) throw new Error('매물을 찾지 못했습니다.');
    return res.json();
  }

  async function createCar(data) {
    const res = await fetch(`tables/${TABLE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data)
    });
    if (!res.ok) { handleAuthFailure(res); throw new Error('등록에 실패했습니다.'); }
    return res.json();
  }

  async function updateCar(id, data) {
    const res = await fetch(`tables/${TABLE}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data)
    });
    if (!res.ok) { handleAuthFailure(res); throw new Error('수정에 실패했습니다.'); }
    return res.json();
  }

  async function deleteCar(id) {
    const res = await fetch(`tables/${TABLE}/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
    if (!res.ok && res.status !== 204) { handleAuthFailure(res); throw new Error('삭제에 실패했습니다.'); }
    return true;
  }

  global.KCarAPI = { listCars, getCar, createCar, updateCar, deleteCar };
})(window);
