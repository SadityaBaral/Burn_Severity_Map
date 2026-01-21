var nepal = ee.FeatureCollection("projects/final-459305/assets/NEPAL_BOUNDARY");
Map.centerObject(nepal, 7);

function maskS2sr(image) {
  var scl = image.select('SCL');
  var mask = scl.eq(4).or(scl.eq(5)).or(scl.eq(6)).or(scl.eq(7)).or(scl.eq(11));
  return image.updateMask(mask).divide(10000);
}

function addIndices(image) {
  var nbr = image.normalizedDifference(['B8', 'B12']).rename('NBR');
  var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
  var ndsi = image.normalizedDifference(['B3', 'B11']).rename('NDSI');
  return image.addBands(nbr).addBands(ndwi).addBands(ndsi);
}

function getYearlyDNBR(pre_start, pre_end, post_start, post_end) {
  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(nepal)
    .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'SCL']);

  var pre = s2.filterDate(pre_start, pre_end)
    .map(maskS2sr)
    .map(addIndices)
    .median()
    .clip(nepal);

  var post = s2.filterDate(post_start, post_end)
    .map(maskS2sr)
    .map(addIndices)
    .median()
    .clip(nepal);

  var dNBR = pre.select('NBR').subtract(post.select('NBR'));

  var water = pre.select('NDWI').lt(0);
  var snow = pre.select('NDSI').lt(0.2).and(post.select('NDSI').lt(0.2));
  var slope = ee.Terrain
    .slope(ee.Image("USGS/SRTMGL1_003").clip(nepal))
    .lt(45);
  var veg = pre.select('NBR').gt(0.10);

  return dNBR.updateMask(water.and(snow).and(slope).and(veg));
}

var dNBR_2022 = getYearlyDNBR(
  '2021-10-15', '2022-01-31',
  '2022-02-15', '2022-05-15'
);

var dNBR_2025 = getYearlyDNBR(
  '2024-10-15', '2025-01-31',
  '2025-02-15', '2025-05-15'
);

var diffMap = dNBR_2025.subtract(dNBR_2022).rename('Severity_Anomaly');

var diffVis = {
  min: -0.2,
  max: 0.2,
  palette: ['0000FF', 'FFFFFF', 'FF0000']
};

Map.addLayer(diffMap, diffVis, 'Difference (2025 - 2022)');
Map.addLayer(
  ee.Image().paint(nepal, 0, 2),
  {palette: 'black'},
  'Boundary'
);

var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});

legend.add(ui.Label({
  value: 'Change in Severity (2022 vs 2025)',
  style: {fontWeight: 'bold'}
}));

legend.add(ui.Label('🟥 RED: Conditions Worsened in 2025 (Drought/Fire)'));
legend.add(ui.Label('⬜ WHITE: No Significant Change'));
legend.add(ui.Label('🟦 BLUE: Conditions Improved (Greener than 2022)'));

Map.add(legend);

var export_image = diffMap.unmask(-9999);

Export.image.toDrive({
  image: export_image,
  description: 'Nepal_Burn_Severity_Difference_2025vs2022',
  scale: 30,
  region: nepal,
  maxPixels: 1e13,
  crs: 'EPSG:4326',
  folder: 'GEE_EXPORTS',
  formatOptions: { noData: -9999 }
});
