; 保留解包画面，直到此启动器打开的 Electron 窗口可见。
StrCpy $R1 '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $R0'
System::Call '*(i 68,i 0,i 0,i 0,i 0,i 0,i 0,i 0,i 0,i 0,i 0,i 0,&i2 0,&i2 0,i 0,i 0,i 0,i 0)p.R2'
System::Call '*(i 0,i 0,i 0,i 0)p.R3'
System::Call 'kernel32::CreateProcessW(w "$INSTDIR\${APP_EXECUTABLE_FILENAME}",w R1,p 0,p 0,i 0,i 0,p 0,p 0,p R2,p R3)i.R4'
System::Free $R2
StrCmp $R4 0 prts_launch_failed
System::Call '*$R3(p .R5,p .R6,i .R7,i)'
System::Free $R3
System::Call 'kernel32::CloseHandle(p R6)'
StrCpy $3 0
Goto prts_find_window

prts_launch_failed:
System::Free $R3
BgImage::Destroy
SetErrorLevel 1
Goto prts_startup_done

prts_find_window:
  StrCpy $4 0
prts_next_window:
  System::Call 'user32::FindWindowExW(p 0,p r4,w "Chrome_WidgetWin_1",p 0)p.r4'
  StrCmp $4 0 prts_wait_frame
  System::Call 'user32::GetWindowThreadProcessId(p r4,*i .r5)i'
  StrCmp $5 $R7 0 prts_next_window
  System::Call 'user32::IsWindowVisible(p r4)i.r6'
  StrCmp $6 0 prts_next_window prts_hide_startup

prts_wait_frame:
  System::Call 'kernel32::WaitForSingleObject(p R5,i 50)i.r5'
  StrCmp $5 258 0 prts_hide_startup
  IntOp $3 $3 + 1
  ; 主进程异常时仍可清除启动画面。最长等待约 90 秒。
  IntCmp $3 1800 prts_hide_startup prts_find_window prts_hide_startup

prts_hide_startup:
  BgImage::Destroy
  System::Call 'kernel32::WaitForSingleObject(p R5,i -1)i'
  System::Call 'kernel32::GetExitCodeProcess(p R5,*i .r0)i.r1'
  System::Call 'kernel32::CloseHandle(p R5)'
  StrCmp $1 0 0 +2
    StrCpy $0 1
  SetErrorLevel $0
prts_startup_done:
