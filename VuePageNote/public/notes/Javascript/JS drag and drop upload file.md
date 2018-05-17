[Instruction article](https://css-tricks.com/drag-and-drop-file-uploading/)

HTML
```html
<!--allow multiple file upload.-->
<!--accept image only.-->
<!--accept phone camera.-->
<!--hide input box-->
<input type="file" multiple="multiple" id="uploadPhoto" accept="image/*;capture=camera" style="display: none;">
<!--magic label element-->
<!--'for' attribute will share behavier and events with input/file-->
<label for="uploadPhoto" id="photo-upload-btn"><strong>Choose a file</strong></label>
```
JS
```javascript
// check if the browser support drag and drop
var isAdvancedUpload = function() {
        var div = document.createElement('div');
        return (('draggable' in div) || ('ondragstart' in div && 'ondrop' in div)) && 'FormData' in window && 'FileReader' in window;
    }();
    
// bind drag event
if (isAdvancedUpload) {
  var droppedFiles = false;
  $("#dragndrop-container").on('drag dragstart dragend dragover dragenter dragleave drop', function(e) {
          e.preventDefault();
          e.stopPropagation();
      })
      .on('dragover dragenter', function() {
          $(this).addClass('is-dragover');
      })
      .on('dragleave dragend drop', function() {
          $(this).removeClass('is-dragover');
      })
      .on('drop', function(e) {
          droppedFiles = e.originalEvent.dataTransfer.files;
          // create url for uploaded files, which can be used to display in DOM
          // eg: <img src=url />
         var url = URL.createObjectURL(droppedFiles[0]);
         // revoke url and release file from memory
         URL.revokeObjectURL(url);
      });
}
```