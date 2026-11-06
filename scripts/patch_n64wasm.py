#!/usr/bin/env python3
"""Patch pinned N64Wasm source with a persistent, single-frame TAS bridge."""
from pathlib import Path
import sys
root=Path(sys.argv[1])
main_path=root/"code"/"mymain.cpp"
make_path=root/"code"/"Makefile"
main=main_path.read_text(encoding="utf-8")
make=make_path.read_text(encoding="utf-8")
def replace_once(source,old,new,label):
    if old not in source: raise SystemExit("Patch target not found: "+label)
    return source.replace(old,new,1)
main=replace_once(main,"    bool ricePlugin = false;\n}\n",'''    bool ricePlugin = false;
}
static int tasButtonState[14] = {0};
static int tasAxisX = 0;
static int tasAxisY = 0;
static bool tasUnpaced = false;
extern "C" {
    void neil_tas_set_unpaced(int enabled) { tasUnpaced = enabled != 0; }
    void neil_tas_set_button(int button,int pressed) {
        if(button>=0 && button<14) tasButtonState[button]=pressed?1:0;
    }
    void neil_tas_set_axis(int x,int y) {
        if(x < -128) x=-128; if(x > 127) x=127;
        if(y < -128) y=-128; if(y > 127) y=127;
        tasAxisX=x; tasAxisY=y;
    }
}
''',"persistent TAS input exports")
main=replace_once(main,"void drawAngryOpenGL();",'''void applyTasInput() {
    neilbuttons[0].aKey=tasButtonState[0]!=0;
    neilbuttons[0].bKey=tasButtonState[1]!=0;
    neilbuttons[0].zKey=tasButtonState[2]!=0;
    neilbuttons[0].startKey=tasButtonState[3]!=0;
    neilbuttons[0].lKey=tasButtonState[4]!=0;
    neilbuttons[0].rKey=tasButtonState[5]!=0;
    neilbuttons[0].upKey=tasButtonState[6]!=0;
    neilbuttons[0].downKey=tasButtonState[7]!=0;
    neilbuttons[0].leftKey=tasButtonState[8]!=0;
    neilbuttons[0].rightKey=tasButtonState[9]!=0;
    neilbuttons[0].cbUp=tasButtonState[10]!=0;
    neilbuttons[0].cbDown=tasButtonState[11]!=0;
    neilbuttons[0].cbLeft=tasButtonState[12]!=0;
    neilbuttons[0].cbRight=tasButtonState[13]!=0;
    int axisX=tasAxisX*32767/127;
    int axisY=-tasAxisY*32767/127;
    if(axisX < -32768) axisX=-32768; if(axisX > 32767) axisX=32767;
    if(axisY < -32768) axisY=-32768; if(axisY > 32767) axisY=32767;
    neilbuttons[0].axis0=axisX;
    neilbuttons[0].axis1=axisY;
}
void drawAngryOpenGL();''',"TAS input application")
main=replace_once(main,"    readConfig();\n    readCheats();","    readConfig();\n    disableAudioSync = false;\n    doubleSpeed = false;\n    readCheats();","manual frame loop config")
old_loop='''    if (doubleSpeed)
    {
        retro_run();
    }
    else
    {
        //allow audio buffer to shrink down
        //if emulator is too far ahead
        audioBufferQueue = SDL_GetQueuedAudioSize(audioDeviceId);
        if (audioBufferQueue < 20000 && fpsAudioRemaining < 5000)
            retro_run();
        else
        {
            hadSkip = 1;
            maxAudioBufferQueue = audioBufferQueue;
        }
    }'''
new_loop='''    // The host calls this function exactly once per TAS frame.
    // Apply latched inputs and bypass audio throttling so a step cannot be skipped.
    applyTasInput();
    retro_run();'''
main=replace_once(main,old_loop,new_loop,"one core frame per host call")
main=replace_once(main,"    limitFPS();","    if (!tasUnpaced) limitFPS();","bypass wall-clock FPS limiter during offline recording")
main_path.write_text(main,encoding="utf-8")
make=replace_once(make,"['callMain','cwrap']","['callMain','cwrap','FS']","export Emscripten FS")
make=replace_once(make,"'_neil_set_buffer_remaining','_neil_set_endframe_callback','_neil_set_double_speed']","'_neil_set_buffer_remaining','_neil_set_endframe_callback','_neil_set_double_speed', '_neil_tas_set_button', '_neil_tas_set_axis', '_neil_tas_set_unpaced']","export TAS bridge")
make_path.write_text(make,encoding="utf-8")
print("Patched N64Wasm with persistent TAS inputs and one retro_run per call.")
