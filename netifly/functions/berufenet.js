// Netlify Function – BERUFENET API Proxy
// Löst das CORS Problem indem Anfragen serverseitig weitergeleitet werden

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  
  let apiUrl = '';
  
  // Berufe suchen
  if (params.suchwoerter) {
    apiUrl = `https://rest.arbeitsagentur.de/infosysbub/bnet/pc/v1/berufe?suchwoerter=${encodeURIComponent(params.suchwoerter)}&page=0`;
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
