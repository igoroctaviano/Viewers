# Adding the study (test-only)

Add a study folder inside the public dir platform/viewer/public so it will be
served/available at http://localhost:3000/your_file or use the default one
(00006466.2.ANON)

# Generate the JSON file

Inside the dicom-to-json folder, run the following command (update the paths to
the study folder and the result folder):

```
node dicom-to-json.js /your_study_folder http://localhost:3000 /path_to_your_json/result_file.json
```

# Update the urls generated in the JSON

Update the urls generated to point to
"dicomweb:http://localhost:3000/your_study_folder"

# Load the viewer pointing to the file in the public dir

```
http://localhost:3000/viewer/?url=http://localhost:3000/result_file.json
```
