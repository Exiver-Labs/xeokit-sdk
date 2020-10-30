import {Program} from "../../../../webgl/Program.js";
import {BatchingOcclusionShaderSource} from "./BatchingOcclusionShaderSource.js";
import {createRTCViewMat, getPlaneRTCPos} from "../../../../math/rtcCoords.js";
import {math} from "../../../../math/math.js";

const tempVec3a = math.vec3();

/**
 * @private
 */
class BatchingOcclusionRenderer {

    constructor(scene) {
        this._scene = scene;
        this._hash = this._getHash();
        this._shaderSource = new BatchingOcclusionShaderSource(this._scene);
        this._allocate();
    }

    getValid() {
        return this._hash === this._getHash();
    };

    _getHash() {
        return this._scene._sectionPlanesState.getHash();
    }

    drawLayer(frameCtx, batchingLayer) {

        const model = batchingLayer.model;
        const scene = model.scene;
        const gl = scene.canvas.gl;
        const state = batchingLayer._state;
        const camera = scene.camera;
        const rtcCenter = batchingLayer._state.rtcCenter;

        if (!this._program) {
            this._allocate(batchingLayer);
            if (this.errors) {
                return;
            }
        }

        let loadSectionPlanes = false;

        if (frameCtx.lastProgramId !== this._program.id) {
            frameCtx.lastProgramId = this._program.id;
            this._bindProgram();
            loadSectionPlanes = true;
        }

        const viewMat = (rtcCenter) ? createRTCViewMat(model.viewMatrix, rtcCenter) : model.viewMatrix;
        gl.uniformMatrix4fv(this._uViewMatrix, false, viewMat);
        gl.uniformMatrix4fv(this._uProjMatrix, false, camera._project._state.matrix);

        if (rtcCenter) {
            if (frameCtx.lastRTCCenter) {
                if (!math.compareVec3(rtcCenter, frameCtx.lastRTCCenter)) {
                    frameCtx.lastRTCCenter = rtcCenter;
                    loadSectionPlanes = true;
                }
            } else {
                frameCtx.lastRTCCenter = rtcCenter;
                loadSectionPlanes = true;
            }
        } else if (frameCtx.lastRTCCenter) {
            frameCtx.lastRTCCenter = null;
            loadSectionPlanes = true;
        }

        if (loadSectionPlanes) {
            const numSectionPlanes = scene._sectionPlanesState.sectionPlanes.length;
            if (numSectionPlanes > 0) {
                const sectionPlanes = scene._sectionPlanesState.sectionPlanes;
                const baseIndex = batchingLayer.layerIndex * numSectionPlanes;
                const renderFlags = model.renderFlags;
                for (let sectionPlaneIndex = 0; sectionPlaneIndex < numSectionPlanes; sectionPlaneIndex++) {
                    const sectionPlaneUniforms = this._uSectionPlanes[sectionPlaneIndex];
                    const active = renderFlags.sectionPlanesActivePerLayer[baseIndex + sectionPlaneIndex];
                    gl.uniform1i(sectionPlaneUniforms.active, active ? 1 : 0);
                    if (active) {
                        const sectionPlane = sectionPlanes[sectionPlaneIndex];
                        if (rtcCenter) {
                            const rtcSectionPlanePos = getPlaneRTCPos(sectionPlane.dist, sectionPlane.dir, rtcCenter, tempVec3a);
                            gl.uniform3fv(sectionPlaneUniforms.pos, rtcSectionPlanePos);
                        } else {
                            gl.uniform3fv(sectionPlaneUniforms.pos, sectionPlane.pos);
                        }
                        gl.uniform3fv(sectionPlaneUniforms.dir, sectionPlane.dir);
                    }
                }
            }
        }

        gl.uniformMatrix4fv(this._uPositionsDecodeMatrix, false, batchingLayer._state.positionsDecodeMatrix);

        this._aPosition.bindArrayBuffer(state.positionsBuf);

        if (this._aOffset) {
            this._aOffset.bindArrayBuffer(state.offsetsBuf);
        }

        if (this._aColor) {
            this._aColor.bindArrayBuffer(state.colorsBuf);
        }

        this._aFlags.bindArrayBuffer(state.flagsBuf);

        if (this._aFlags2) { // Won't be in shader when not clipping
            this._aFlags2.bindArrayBuffer(state.flags2Buf);
        }

        state.indicesBuf.bind();

        gl.drawElements(state.primitive, state.indicesBuf.numItems, state.indicesBuf.itemType, 0);
    }

    _allocate() {
        const scene = this._scene;
        const gl = scene.canvas.gl;
        const sectionPlanesState = scene._sectionPlanesState;
        this._program = new Program(gl, this._shaderSource);
        if (this._program.errors) {
            this.errors = this._program.errors;
            return;
        }
        const program = this._program;
        this._uPositionsDecodeMatrix = program.getLocation("positionsDecodeMatrix");
        this._uViewMatrix = program.getLocation("viewMatrix");
        this._uProjMatrix = program.getLocation("projMatrix");
        this._uSectionPlanes = [];
        const sectionPlanes = sectionPlanesState.sectionPlanes;
        for (var i = 0, len = sectionPlanes.length; i < len; i++) {
            this._uSectionPlanes.push({
                active: program.getLocation("sectionPlaneActive" + i),
                pos: program.getLocation("sectionPlanePos" + i),
                dir: program.getLocation("sectionPlaneDir" + i)
            });
        }
        this._aPosition = program.getAttribute("position");
        this._aOffset = program.getAttribute("offset");
        this._aColor = program.getAttribute("color");
        this._aFlags = program.getAttribute("flags");
        this._aFlags2 = program.getAttribute("flags2");
    }

    _bindProgram() {
        this._program.bind();
    }

    webglContextRestored() {
        this._program = null;
    }

    destroy() {
        if (this._program) {
            this._program.destroy();
        }
        this._program = null;
    }
}

export {BatchingOcclusionRenderer};