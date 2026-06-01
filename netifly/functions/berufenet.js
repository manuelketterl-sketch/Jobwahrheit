// Netlify Function – BERUFENET API Proxy
// Löst das CORS Problem indem Anfragen serverseitig weitergeleitet werden

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  
  let apiUrl = '';
  
  // Berufe suchen – alle Berufsgruppen
  if (params.suchwoerter) {
    // Mehrere Berufsgruppen parallel abfragen:
    // 100-105 = Ausbildungsberufe
    // 200-204 = Weiterbildungsberufe  
    // 300-302 = Studiengänge
    // 400-402 = Hochschulberufe
    // 700 = Tätigkeitsfelder
    const suchbegriff = encodeURIComponent(params.suchwoerter);
    
    const urls = [
      `https://rest.arbeitsagentur.de/infosysbub/bnet/pc/v1/berufe?suchwoerter=${suchbegriff}&berufsgruppe=100&page=0`,
      `https://rest.arbeitsagentur.de/infosysbub/bnet/pc/v1/berufe?suchwoerter=${suchbegriff}&berufsgruppe=200&page=0`,
      `https://rest.arbeitsagentur.de/infosysbub/bnet/pc/v1/berufe?suchwoerter=${suchbegriff}&berufsgruppe=300&page=0`,
      `https://rest.arbeitsagentur.de/infosysbub/bnet/pc/v1/berufe?suchwoerter=${suchbegriff}&berufsgruppe=400&page=0`,
      `https://rest.arbeitsagentur.de/infosysbub/bnet/pc/v1/berufe?suchwoerter=${suchbegriff}&berufsgruppe=700&page=0`,
    ];

    try {
      const responses = await Promise.all(
        urls.map(url => fetch(url, {
          headers: { 'X-API-Key': 'infosysbub-berufenet', 'Accept': 'application/json' }
        }).then(r => r.json()).catch(() => null))
      );

      // Alle Ergebnisse zusammenführen und deduplizieren
      const alleBerufe = [];
      const geseheneIds = new Set();

      for (const data of responses) {
        if (!data) continue;
        const berufe = data?.berufe || data?.content || data || [];
        for (const beruf of berufe) {
          const id = beruf.id || beruf.dkzId || beruf.kurzBezeichnungNeutral;
          if (id && !geseheneIds.has(id)) {
            geseheneIds.add(id);
            alleBerufe.push(beruf);
          }
        }
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ berufe: alleBerufe.slice(0, 12) })
      };

    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  // Berufsdetail
  else if (params.dkzId && params.type === 'detail') {
    apiUrl = `https://rest.arbeitsagentur.de/infosysbub/dkz-rest/pc/v1/berufe/${params.dkzId}/`;
  }
  // Ähnliche Berufe
  else if (params.dkzId && params.type === 'similar') {
    apiUrl = `https://rest.arbeitsagentur.de/sete/suggest/pc/v1/inspiration/gattungen/${params.dkzId}?ausgangsberufDkzId=${params.dkzId}`;
  }
  // Kategorie
  else if (params.cluster) {
    apiUrl = `https://rest.arbeitsagentur.de/infosysbub/bnet/pc/v1/berufe?berufecluster=${encodeURIComponent(params.cluster)}&page=0`;
  }
  else {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Fehlende Parameter' })
    };
  }

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'X-API-Key': 'infosysbub-berufenet',
        'Accept': 'application/json'
      }
    });

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
