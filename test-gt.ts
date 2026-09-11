const url = 'https://api.geckoterminal.com/api/v2/networks/bsc/pools/0x630b9c39d46314a3268d75bb25fd79df4581d1af/trades';
fetch(url)
  .then(r => r.json())
  .then(data => {
    console.log(JSON.stringify(data.data.slice(0, 2).map(t => t.attributes), null, 2));
  });
