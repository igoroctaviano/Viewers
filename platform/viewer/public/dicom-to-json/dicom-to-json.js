const dcmjs = require('dcmjs');
var path = require('path');
var fs = require('fs');

var args = process.argv.slice(2);

const [studyDirectory, urlPrefix, outputPath] = args;

if (args.length !== 3) {
  console.log(
    'expecting --- node dicom-to-json.js path_to_dicom_files url_prefix path_to_result/name_of_file.json'
  );
  return;
}

const _model = {
  studies: [],
};

function _getStudy(StudyInstanceUID) {
  return _model.studies.find(
    aStudy => aStudy.StudyInstanceUID === StudyInstanceUID
  );
}

function _getSeries(StudyInstanceUID, SeriesInstanceUID) {
  const study = _getStudy(StudyInstanceUID);

  if (!study) {
    return;
  }

  return study.series.find(
    aSeries => aSeries.SeriesInstanceUID === SeriesInstanceUID
  );
}

function createStudyMetadata(StudyInstanceUID, instance) {
  const {
    StudyDescription,
    StudyDate,
    StudyTime,
    PatientName,
    PatientID,
    AccessionNumber,
    PatientAge,
    PatientSex,
    PatientWeight,
  } = instance;
  return {
    StudyInstanceUID,
    StudyDescription,
    StudyDate,
    StudyTime,
    PatientName,
    PatientID,
    AccessionNumber,
    PatientAge,
    PatientSex,
    PatientWeight,
    series: [],
  };
}
function createSeriesMetadata(instance) {
  const {
    SeriesInstanceUID,
    SeriesDescription,
    SeriesNumber,
    SeriesTime,
    Modality,
    SliceThickness,
  } = instance;

  return {
    SeriesInstanceUID,
    SeriesDescription,
    SeriesNumber,
    SeriesTime,
    Modality,
    SliceThickness,
    instances: [],
  };
}

function createInstanceMetaData(instance) {
  const {
    Columns,
    Rows,
    InstanceNumber,
    SOPClassUID,
    AcquisitionNumber,
    PhotometricInterpretation,
    BitsAllocated,
    BitsStored,
    PixelRepresentation,
    SamplesPerPixel,
    PixelSpacing,
    HighBit,
    ImageOrientationPatient,
    ImagePositionPatient,
    FrameOfReferenceUID,
    ImageType,
    Modality,
    SOPInstanceUID,
    SeriesInstanceUID,
    StudyInstanceUID,
    SeriesDate,
    ConceptNameCodeSequence,
    // RT stuff
    AccessionNumber,
    ApprovalStatus,
    InstanceCreationDate,
    InstanceCreationTime,
    Manufacturer,
    ManufacturerModelName,
    PatientBirthDate,
    PatientID,
    PatientName,
    PatientSex,
    PhysiciansOfRecord,
    ROIContourSequence,
    RTROIObservationsSequence,
    ReferencedFrameOfReferenceSequence,
    ReferencedStudySequence,
    ReferringPhysicianName,
    SeriesDescription,
    SeriesNumber,
    SoftwareVersions,
    SpecificCharacterSet,
    StationName,
    StructureSetDate,
    StructureSetLabel,
    StructureSetName,
    StructureSetROISequence,
    StructureSetTime,
    StudyDate,
    StudyDescription,
    StudyID,
    StudyTime,
  } = instance;
  return {
    metadata: {
      Columns,
      Rows,
      InstanceNumber,
      SOPClassUID,
      AcquisitionNumber,
      PhotometricInterpretation,
      BitsAllocated,
      BitsStored,
      PixelRepresentation,
      SamplesPerPixel,
      PixelSpacing,
      HighBit,
      ImageOrientationPatient,
      ImagePositionPatient,
      FrameOfReferenceUID,
      ImageType,
      Modality,
      SOPInstanceUID,
      SeriesInstanceUID,
      StudyInstanceUID,
      ConceptNameCodeSequence: ConceptNameCodeSequence || undefined,
      SeriesDate: SeriesDate || undefined,
      // RT stuff
      AccessionNumber,
      ApprovalStatus,
      InstanceCreationDate,
      InstanceCreationTime,
      Manufacturer,
      ManufacturerModelName,
      PatientBirthDate,
      PatientID,
      PatientName,
      PatientSex,
      PhysiciansOfRecord,
      ROIContourSequence,
      RTROIObservationsSequence,
      ReferencedFrameOfReferenceSequence,
      ReferencedStudySequence,
      ReferringPhysicianName,
      SeriesDescription,
      SeriesNumber,
      SoftwareVersions,
      SpecificCharacterSet,
      StationName,
      StructureSetDate,
      StructureSetLabel,
      StructureSetName,
      StructureSetROISequence,
      StructureSetTime,
      StudyDate,
      StudyDescription,
      StudyID,
      StudyTime,
    },
    url: instance.fileLocation,
  };
}

// https://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search
const walk = function(dir, done) {
  let results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    let i = 0;
    (function next() {
      let file = list[i++];
      if (!file) return done(null, results);
      file = path.resolve(dir, file);
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            next();
          });
        } else {
          results.push(file);
          next();
        }
      });
    })();
  });
};

const craeteImageId = fileLocation => {
  return 'dicomweb:' + urlPrefix + fileLocation;
};

const storeData = (data, path) => {
  try {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
};

walk(studyDirectory, function(err, files) {
  let numInstances = 0;
  let modalities = new Set();

  if (err) throw err;

  // check other file types li
  console.debug('Processing files... amount:', files.length);
  files.forEach(file => {
    if (!file.includes('.DS_Store') && !file.includes('.xml')) {
      console.debug('Processing file...', file);
      var arrayBuffer = fs.readFileSync(file).buffer;

      /** Add header if not present */
      var stream = new dcmjs.data.ReadBufferStream(arrayBuffer, true);
      stream.reset();
      stream.increment(128);
      if (stream.readString(4) !== 'DICM') {
        const metaStream = new dcmjs.data.WriteBufferStream(128, true);
        metaStream.writeHex('00'.repeat(128));
        metaStream.writeString('DICM');
        const metaBuffer = metaStream.getBuffer();
        arrayBuffer = concatArrayBuffers(metaBuffer, arrayBuffer);
        console.log('New array buffer:', arrayBuffer);
      }

      let DicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer);
      const instance = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
        DicomDict.dict
      );

      instance.fileLocation = craeteImageId(file);
      const { StudyInstanceUID, SeriesInstanceUID } = instance;
      let study = _getStudy(StudyInstanceUID);

      if (!study) {
        _model.studies.push(createStudyMetadata(StudyInstanceUID, instance));
        study = _model.studies[_model.studies.length - 1];
      }

      let series = _getSeries(StudyInstanceUID, SeriesInstanceUID);

      if (!series) {
        study.series.push(createSeriesMetadata(instance));
        series = study.series[study.series.length - 1];
      }

      const instanceMetaData = createInstanceMetaData(instance);
      modalities.add(instanceMetaData.metadata.Modality);
      series.instances.push(instanceMetaData);
      numInstances += 1;
    }
  });

  console.log('Sucessfully loaded data!');
  console.log(modalities);

  // TODO: cover multi studies
  _model.studies[0].NumInstances = numInstances;
  _model.studies[0].Modalities = Array.from(modalities).join('/');

  storeData(_model, outputPath);
  console.log('JSON saved!');
});

/**
 * Creates a new ArrayBuffer from concatenating two existing ones
 *
 * @param {ArrayBuffer | null} buffer1 The first buffer.
 * @param {ArrayBuffer | null} buffer2 The second buffer.
 * @return {ArrayBuffer | null} The new ArrayBuffer created out of the two.
 */
var concatArrayBuffers = function(buffer1, buffer2) {
  if (!buffer1) {
    return buffer2;
  } else if (!buffer2) {
    return buffer1;
  }

  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
};
