
var nepal_roi = ee.FeatureCollection("projects/final-459305/assets/NEPAL_BOUNDARY");
Map.centerObject(nepal_roi, 7);

var pre_start = '2021-10-15'; 
var pre_end   = '2022-01-31';

var post_start = '2022-02-15'; 
var post_end   = '2022-05-15';

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

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(nepal_roi)
  .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'SCL']);

var pre_fire = s2.filterDate(pre_start, pre_end)
  .map(maskS2sr)
  .map(addIndices)
  .median()
  .clip(nepal_roi);

var post_fire = s2.filterDate(post_start, post_end)
  .map(maskS2sr)
  .map(addIndices)
  .median()
  .clip(nepal_roi);

var dNBR = pre_fire.select('NBR')
  .subtract(post_fire.select('NBR'))
  .rename('dNBR');

var water_mask = pre_fire.select('NDWI').lt(0); 

var snow_mask = pre_fire.select('NDSI').lt(0.2)
  .and(post_fire.select('NDSI').lt(0.2));

var dem = ee.Image("USGS/SRTMGL1_003").clip(nepal_roi);
var slope = ee.Terrain.slope(dem);
var slope_mask = slope.lt(40); 

var veg_mask = pre_fire.select('NBR').gt(0.15); 

var final_mask = water_mask
  .and(snow_mask)
  .and(slope_mask)
  .and(veg_mask);

var dNBR_corrected = dNBR.updateMask(final_mask);

var burn_classes = ee.Image(0)
  .where(dNBR_corrected.gte(0.20).and(dNBR_corrected.lt(0.30)), 1)
  .where(dNBR_corrected.gte(0.30).and(dNBR_corrected.lt(0.40)), 2)
  .where(dNBR_corrected.gte(0.40), 3);

var burn_smooth = burn_classes.focal_mode({
  radius: 1.5,
  kernelType: 'square',
  iterations: 1
});

var final_map = burn_smooth.updateMask(final_mask).clip(nepal_roi);

var visParams = {
  min: 0,
  max: 3,
  palette: ['006400', 'FFFF00', 'FFA500', 'FF0000']
};

Map.addLayer(pre_fire, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 'True Color (Pre-Fire)', false);
Map.addLayer(final_map, visParams, 'Burn Severity (Gap-Filled & Adjusted)');
Map.addLayer(ee.Image().paint(nepal_roi, 0, 2), {palette: 'black'}, 'Boundary');

var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});

legend.add(ui.Label({
  value: 'Burn Severity (2022)',
  style: {fontWeight: 'bold', fontSize: '18px'}
}));

var makeRow = function(color, name) {
  return ui.Panel({
    widgets: [
      ui.Label({style: {backgroundColor: color, padding: '8px', margin: '0 0 4px 0'}}),
      ui.Label({value: name, style: {margin: '0 0 4px 6px'}})
    ],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};

legend.add(makeRow('006400', 'Unburned (< 0.20)'));
legend.add(makeRow('FFFF00', 'Low Severity (0.20 - 0.30)'));
legend.add(makeRow('FFA500', 'Moderate Severity (0.30 - 0.40)'));
legend.add(makeRow('FF0000', 'High Severity (> 0.40)'));

Map.add(legend);

var export_image = final_map.unmask(-9999);

Export.image.toDrive({
  image: export_image,
  description: 'Nepal_Burn_Map_Optimized',
  scale: 30,
  region: nepal_roi,
  maxPixels: 1e13,
  crs: 'EPSG:4326',
  folder: 'GEE_EXPORTS',
  formatOptions: { noData: -9999 }
});
