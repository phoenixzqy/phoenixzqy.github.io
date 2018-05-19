export default {
    // get current url params
    getCurrentParams() {
        var qs = location.href.split('?')[1];
        if (qs) {
            qs = qs.split('+').join(' ');

            var params = {},
                tokens,
                re = /[?&]?([^=]+)=([^&]*)/g;

            while (tokens = re.exec(qs)) {
                params[decodeURIComponent(tokens[1])] = decodeURIComponent(tokens[2]);
            }
            return params;
        }
    },
    // get file name and remove extension
    getFileName(fileName) {
        for(var i = fileName.length - 1; i >=0; i--) {
            if(fileName[i] === '.') {
                return fileName.substring(0,i);
            }
        }
    }
}