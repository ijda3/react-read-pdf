import * as React from "react";
import { Component,Fragment } from 'react';
import * as CSSModules from "react-css-modules";
import * as styles from './index.less';
import * as pdfjsLib from 'pdfjs-dist';
const pdfjsViewer = require('../../../node_modules/pdfjs-dist/web/pdf_viewer.js');
// The workerSrc property shall be specified.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.0.550/pdf.worker.js';
let USE_ONLY_CSS_ZOOM = true
let TEXT_LAYER_MODE = 0 // DISABLE
let MAX_IMAGE_SIZE = 1024 * 1024
let CMAP_PACKED = true
let DEFAULT_URL = '/test.pdf'
let DEFAULT_SCALE_DELTA = 1.1
let MIN_SCALE = 0.25
let MAX_SCALE = 10.0
let DEFAULT_SCALE_VALUE = 'auto'
interface IProps {

}
interface IStates {
  currentPageNumber:string
}
class MobilePDFReader extends Component<IProps,IStates> {
  state:IStates={
    currentPageNumber: 1
  }
  public constructor (props:IProps) {
    super(props)
    this.pdfLoadingTask = null
    this.pdfDocument = null
    this.pdfViewer = null
    this.pdfHistory = null
    this.pdfLinkService = null
    this.container = React.createRef()
  }
  get pagesCount () {
    return this.pdfDocument.numPages
  }
  get page () {
    if (this.pdfViewer != null) {
      return this.pdfViewer.currentPageNumber
    } else {
      return 1
    }
  }
  get loadingBar () {
    var bar = new pdfjsViewer.ProgressBar('#loadingBar', {})
    return pdfjsLib.shadow(this, 'loadingBar', bar)
  }
  open (params) {
    var url = params.url
    var self = this
    this.setTitleUsingUrl(url)
    // Loading document.
    var loadingTask = pdfjsLib.getDocument({
      url: url,
      withCredentials: true,
      maxImageSize: MAX_IMAGE_SIZE,
      cMapPacked: CMAP_PACKED
    })
    this.pdfLoadingTask = loadingTask

    loadingTask.onProgress = function (progressData) {
      self.progress(progressData.loaded / progressData.total)
    }

    return loadingTask.promise.then(function (pdfDocument) {
      // Document loaded, specifying document for the viewer.
      self.pdfDocument = pdfDocument
      self.pdfViewer.setDocument(pdfDocument)
      self.pdfLinkService.setDocument(pdfDocument)
      self.pdfHistory.initialize(pdfDocument.fingerprint)
      self.loadingBar.hide()
      self.setTitleUsingMetadata(pdfDocument)
    }, function (exception) {
      var message = exception && exception.message
      var l10n = self.l10n
      var loadingErrorMessage

      if (exception instanceof pdfjsLib.InvalidPDFException) {
        // change error message also for other builds
        loadingErrorMessage = l10n.get('invalid_file_error', null,
          'Invalid or corrupted PDF file.')
      } else if (exception instanceof pdfjsLib.MissingPDFException) {
        // special message for missing PDFs
        loadingErrorMessage = l10n.get('missing_file_error', null,
          'Missing PDF file.')
      } else if (exception instanceof pdfjsLib.UnexpectedResponseException) {
        loadingErrorMessage = l10n.get('unexpected_response_error', null,
          'Unexpected server response.')
      } else {
        loadingErrorMessage = l10n.get('loading_error', null,
          'An error occurred while loading the PDF.')
      }

      loadingErrorMessage.then(function (msg) {
        self.error(msg, { message: message })
      })
      self.loadingBar.hide()
    })
  }
  setTitleUsingUrl (url) {
    this.url = url
    var title = pdfjsLib.getFilenameFromUrl(url) || url
    try {
      title = decodeURIComponent(title)
    } catch (e) {
      // decodeURIComponent may throw URIError,
      // fall back to using the unprocessed url in that case
    }
    this.setTitle(title)
  }
  setTitleUsingMetadata (pdfDocument) {
    var self = this
    pdfDocument.getMetadata().then(function (data) {
      var info = data.info; var metadata = data.metadata
      self.documentInfo = info
      self.metadata = metadata

      // Provides some basic debug information
      console.log('PDF ' + pdfDocument.fingerprint + ' [' +
                  info.PDFFormatVersion + ' ' + (info.Producer || '-').trim() +
                  ' / ' + (info.Creator || '-').trim() + ']' +
                  ' (PDF.js: ' + (pdfjsLib.version || '-') + ')')

      var pdfTitle
      if (metadata && metadata.has('dc:title')) {
        var title = metadata.get('dc:title')
        // Ghostscript sometimes returns 'Untitled', so prevent setting the
        // title to 'Untitled.
        if (title !== 'Untitled') {
          pdfTitle = title
        }
      }

      if (!pdfTitle && info && info['Title']) {
        pdfTitle = info['Title']
      }

      if (pdfTitle) {
        self.setTitle(pdfTitle + ' - ' + document.title)
      }
    })
  }
  setTitle (title) {
    document.title = title
    // document.getElementById('title').textContent = title;
  }
  progress (level) {
    var percent = Math.round(level * 100)
    // Updating the bar if value increases.
    if (percent > this.loadingBar.percent || isNaN(percent)) {
      this.loadingBar.percent = percent
    }
  }
  initUI () {
    var linkService = new pdfjsViewer.PDFLinkService()
    const self = this
    this.pdfLinkService = linkService

    this.l10n = pdfjsViewer.NullL10n

    var container = this.container.current
    var pdfViewer = new pdfjsViewer.PDFViewer({
      container: container,
      linkService: linkService,
      l10n: this.l10n,
      useOnlyCssZoom: USE_ONLY_CSS_ZOOM,
      textLayerMode: TEXT_LAYER_MODE
    })
    this.pdfViewer = pdfViewer
    linkService.setViewer(pdfViewer)

    this.pdfHistory = new pdfjsViewer.PDFHistory({
      linkService: linkService
    })
    linkService.setHistory(this.pdfHistory)
    container.addEventListener('pagesinit', function () {
      // We can use pdfViewer now, e.g. let's change default scale.
      pdfViewer.currentScaleValue = DEFAULT_SCALE_VALUE
    })
    container.addEventListener('pagechange', function (evt) {
      var page = evt.pageNumber
      self.setState({ currentPageNumber: page })
    })
  }
  zoomIn = (ticks) => {
    var newScale = this.pdfViewer.currentScale
    do {
      newScale = (newScale * DEFAULT_SCALE_DELTA).toFixed(2)
      newScale = Math.ceil(newScale * 10) / 10
      newScale = Math.min(MAX_SCALE, newScale)
    } while (--ticks && newScale < MAX_SCALE)
    this.pdfViewer.currentScaleValue = newScale
  }
  zoomOut = (ticks) => {
    var newScale = this.pdfViewer.currentScale
    do {
      newScale = (newScale / DEFAULT_SCALE_DELTA).toFixed(2)
      newScale = Math.floor(newScale * 10) / 10
      newScale = Math.max(MIN_SCALE, newScale)
    } while (--ticks && newScale > MIN_SCALE)
    this.pdfViewer.currentScaleValue = newScale
  }
  pageAdd = () => {
    if (this.pdfViewer.currentPageNumber > this.pdfDocument.numPages) {
      return
    }
    this.pdfViewer.currentPageNumber++
    console.log(this.pdfViewer.currentPageNumber)
  }
  pageDelete = () => {
    if (this.pdfViewer.currentPageNumber < 1) {
      return
    }
    this.pdfViewer.currentPageNumber--
  }
  componentDidMount () {
    const { url } = this.props
    this.initUI()
    this.open({
      url
    })
  }
  public render(){
    return <div>
              <div id="viewerContainer" ref={this.container}>
                <div id="viewer" className="pdfViewer" ></div>
              </div>
              <div id="loadingBar">
                <div className="progress"></div>
                <div className="glimmer"></div>
              </div>
              <div id="errorWrapper" hidden={true}>
                <div id="errorMessageLeft">
                  <span id="errorMessage"></span>
                  <button id="errorShowMore">
                     More Information
                  </button>
                  <button id="errorShowLess">
                     Less Information
                  </button>
                </div>
                <div id="errorMessageRight">
                  <button id="errorClose">
                     Close
                  </button>
                </div>
                <div className="clearBoth"></div>
                <textarea id="errorMoreInfo" hidden={true} readOnly="readonly"></textarea>
              </div>
              <footer className="mobile__pdf__footer">
                <button className="toolbarButton pageUp" title="Previous Page" id="previous" onClick={this.pageDelete}></button>
                <button className="toolbarButton pageDown" title="Next Page" id="next" onClick={this.pageAdd}></button>
                <input type="number" id="pageNumber" className="toolbarField pageNumber" value={this.state.currentPageNumber} size="4" min="1" onChange={this.changePageNumber}/>
                <button className="toolbarButton zoomOut" title="Zoom Out" id="zoomOut" onClick={this.zoomOut}></button>
                <button className="toolbarButton zoomIn" title="Zoom In" id="zoomIn" onClick={this.zoomIn}></button>
             </footer>
          </div>
  }
}
export default  CSSModules(MobilePDFReader,styles);