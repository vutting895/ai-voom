/**
 * Cancellable HTTP-backed tool executors.
 * Keep network I/O separate from AI SDK tool declarations so cancellation can
 * be verified without live third-party services.
 */
export async function fetchWikipediaSummary(query, { signal, fetchImpl = fetch } = {}) {
  try {
    const url = `https://th.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const res = await fetchImpl(url, { signal });
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title,
        summary: data.extract,
        url: data.content_urls?.desktop?.page || `https://th.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        success: true
      };
    }

    const urlEn = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const resEn = await fetchImpl(urlEn, { signal });
    if (resEn.ok) {
      const dataEn = await resEn.json();
      return {
        title: dataEn.title,
        summary: dataEn.extract,
        url: dataEn.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        success: true
      };
    }
    return { error: 'ไม่พบข้อมูลที่ค้นหาใน Wikipedia', success: false };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return { error: error.message, success: false };
  }
}

export async function fetchExternalApi(source, { signal, fetchImpl = fetch } = {}) {
  try {
    let url = '';
    if (source === 'crypto') {
      url = 'https://api.coindesk.com/v1/bpi/currentprice.json';
    } else if (source === 'joke') {
      url = 'https://official-joke-api.appspot.com/random_joke';
    } else if (source === 'weather') {
      url = 'https://wttr.in/Bangkok?format=j1';
    } else {
      return { error: 'ไม่พบแหล่งข้อมูลที่ระบุ', success: false };
    }

    const res = await fetchImpl(url, { signal });
    if (res.ok) {
      const data = await res.json();
      return { source, url, data, success: true };
    }
    const responseText = await res.text();
    return {
      source,
      url,
      data: responseText.slice(0, 500),
      success: true,
      warning: 'API return non-JSON or status ' + res.status
    };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return { error: error.message, success: false };
  }
}
