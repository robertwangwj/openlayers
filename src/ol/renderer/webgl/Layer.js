/**
 * @module ol/renderer/webgl/Layer
 */
import {inherits} from '../../index.js';
import RenderEvent from '../../render/Event.js';
import RenderEventType from '../../render/EventType.js';
import _ol_render_webgl_Immediate_ from '../../render/webgl/Immediate.js';
import LayerRenderer from '../Layer.js';
import _ol_renderer_webgl_defaultmapshader_ from '../webgl/defaultmapshader.js';
import _ol_renderer_webgl_defaultmapshader_Locations_ from '../webgl/defaultmapshader/Locations.js';
import _ol_transform_ from '../../transform.js';
import {create, fromTransform} from '../../vec/mat4.js';
import _ol_webgl_ from '../../webgl.js';
import _ol_webgl_Buffer_ from '../../webgl/Buffer.js';
import _ol_webgl_Context_ from '../../webgl/Context.js';

/**
 * @constructor
 * @abstract
 * @extends {ol.renderer.Layer}
 * @param {ol.renderer.webgl.Map} mapRenderer Map renderer.
 * @param {ol.layer.Layer} layer Layer.
 */
const WebGLLayerRenderer = function(mapRenderer, layer) {

  LayerRenderer.call(this, layer);

  /**
   * @protected
   * @type {ol.renderer.webgl.Map}
   */
  this.mapRenderer = mapRenderer;

  /**
   * @private
   * @type {ol.webgl.Buffer}
   */
  this.arrayBuffer_ = new _ol_webgl_Buffer_([
    -1, -1, 0, 0,
    1, -1, 1, 0,
    -1, 1, 0, 1,
    1, 1, 1, 1
  ]);

  /**
   * @protected
   * @type {WebGLTexture}
   */
  this.texture = null;

  /**
   * @protected
   * @type {WebGLFramebuffer}
   */
  this.framebuffer = null;

  /**
   * @protected
   * @type {number|undefined}
   */
  this.framebufferDimension = undefined;

  /**
   * @protected
   * @type {ol.Transform}
   */
  this.texCoordMatrix = _ol_transform_.create();

  /**
   * @protected
   * @type {ol.Transform}
   */
  this.projectionMatrix = _ol_transform_.create();

  /**
   * @type {Array.<number>}
   * @private
   */
  this.tmpMat4_ = create();

  /**
   * @private
   * @type {ol.renderer.webgl.defaultmapshader.Locations}
   */
  this.defaultLocations_ = null;

};

inherits(WebGLLayerRenderer, LayerRenderer);


/**
 * @param {olx.FrameState} frameState Frame state.
 * @param {number} framebufferDimension Framebuffer dimension.
 * @protected
 */
WebGLLayerRenderer.prototype.bindFramebuffer = function(frameState, framebufferDimension) {

  const gl = this.mapRenderer.getGL();

  if (this.framebufferDimension === undefined ||
      this.framebufferDimension != framebufferDimension) {
    /**
     * @param {WebGLRenderingContext} gl GL.
     * @param {WebGLFramebuffer} framebuffer Framebuffer.
     * @param {WebGLTexture} texture Texture.
     */
    const postRenderFunction = function(gl, framebuffer, texture) {
      if (!gl.isContextLost()) {
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
      }
    }.bind(null, gl, this.framebuffer, this.texture);

    frameState.postRenderFunctions.push(
      /** @type {ol.PostRenderFunction} */ (postRenderFunction)
    );

    const texture = _ol_webgl_Context_.createEmptyTexture(
      gl, framebufferDimension, framebufferDimension);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(_ol_webgl_.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(_ol_webgl_.FRAMEBUFFER,
      _ol_webgl_.COLOR_ATTACHMENT0, _ol_webgl_.TEXTURE_2D, texture, 0);

    this.texture = texture;
    this.framebuffer = framebuffer;
    this.framebufferDimension = framebufferDimension;

  } else {
    gl.bindFramebuffer(_ol_webgl_.FRAMEBUFFER, this.framebuffer);
  }

};


/**
 * @param {olx.FrameState} frameState Frame state.
 * @param {ol.LayerState} layerState Layer state.
 * @param {ol.webgl.Context} context Context.
 */
WebGLLayerRenderer.prototype.composeFrame = function(frameState, layerState, context) {

  this.dispatchComposeEvent_(RenderEventType.PRECOMPOSE, context, frameState);

  context.bindBuffer(_ol_webgl_.ARRAY_BUFFER, this.arrayBuffer_);

  const gl = context.getGL();

  const fragmentShader = _ol_renderer_webgl_defaultmapshader_.fragment;
  const vertexShader = _ol_renderer_webgl_defaultmapshader_.vertex;

  const program = context.getProgram(fragmentShader, vertexShader);

  let locations;
  if (!this.defaultLocations_) {
    locations = new _ol_renderer_webgl_defaultmapshader_Locations_(gl, program);
    this.defaultLocations_ = locations;
  } else {
    locations = this.defaultLocations_;
  }

  if (context.useProgram(program)) {
    gl.enableVertexAttribArray(locations.a_position);
    gl.vertexAttribPointer(
      locations.a_position, 2, _ol_webgl_.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(locations.a_texCoord);
    gl.vertexAttribPointer(
      locations.a_texCoord, 2, _ol_webgl_.FLOAT, false, 16, 8);
    gl.uniform1i(locations.u_texture, 0);
  }

  gl.uniformMatrix4fv(locations.u_texCoordMatrix, false,
    fromTransform(this.tmpMat4_, this.getTexCoordMatrix()));
  gl.uniformMatrix4fv(locations.u_projectionMatrix, false,
    fromTransform(this.tmpMat4_, this.getProjectionMatrix()));
  gl.uniform1f(locations.u_opacity, layerState.opacity);
  gl.bindTexture(_ol_webgl_.TEXTURE_2D, this.getTexture());
  gl.drawArrays(_ol_webgl_.TRIANGLE_STRIP, 0, 4);

  this.dispatchComposeEvent_(RenderEventType.POSTCOMPOSE, context, frameState);
};


/**
 * @param {ol.render.EventType} type Event type.
 * @param {ol.webgl.Context} context WebGL context.
 * @param {olx.FrameState} frameState Frame state.
 * @private
 */
WebGLLayerRenderer.prototype.dispatchComposeEvent_ = function(type, context, frameState) {
  const layer = this.getLayer();
  if (layer.hasListener(type)) {
    const viewState = frameState.viewState;
    const resolution = viewState.resolution;
    const pixelRatio = frameState.pixelRatio;
    const extent = frameState.extent;
    const center = viewState.center;
    const rotation = viewState.rotation;
    const size = frameState.size;

    const render = new _ol_render_webgl_Immediate_(
      context, center, resolution, rotation, size, extent, pixelRatio);
    const composeEvent = new RenderEvent(
      type, render, frameState, null, context);
    layer.dispatchEvent(composeEvent);
  }
};


/**
 * @return {!ol.Transform} Matrix.
 */
WebGLLayerRenderer.prototype.getTexCoordMatrix = function() {
  return this.texCoordMatrix;
};


/**
 * @return {WebGLTexture} Texture.
 */
WebGLLayerRenderer.prototype.getTexture = function() {
  return this.texture;
};


/**
 * @return {!ol.Transform} Matrix.
 */
WebGLLayerRenderer.prototype.getProjectionMatrix = function() {
  return this.projectionMatrix;
};


/**
 * Handle webglcontextlost.
 */
WebGLLayerRenderer.prototype.handleWebGLContextLost = function() {
  this.texture = null;
  this.framebuffer = null;
  this.framebufferDimension = undefined;
};


/**
 * @abstract
 * @param {olx.FrameState} frameState Frame state.
 * @param {ol.LayerState} layerState Layer state.
 * @param {ol.webgl.Context} context Context.
 * @return {boolean} whether composeFrame should be called.
 */
WebGLLayerRenderer.prototype.prepareFrame = function(frameState, layerState, context) {};


/**
 * @abstract
 * @param {ol.Pixel} pixel Pixel.
 * @param {olx.FrameState} frameState FrameState.
 * @param {function(this: S, ol.layer.Layer, (Uint8ClampedArray|Uint8Array)): T} callback Layer
 *     callback.
 * @param {S} thisArg Value to use as `this` when executing `callback`.
 * @return {T|undefined} Callback result.
 * @template S,T,U
 */
WebGLLayerRenderer.prototype.forEachLayerAtPixel = function(pixel, frameState, callback, thisArg) {};
export default WebGLLayerRenderer;
