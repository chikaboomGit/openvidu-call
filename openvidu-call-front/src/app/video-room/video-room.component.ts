import { Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs/internal/Subscription';
import { Router } from '@angular/router';
import {
	Publisher,
	Subscriber,
	Session,
	StreamEvent,
	StreamPropertyChangedEvent,
	SessionDisconnectedEvent,
	PublisherSpeakingEvent,
	ConnectionEvent
} from 'openvidu-browser';
import { UserModel } from '../shared/models/user-model';
import { ChatComponent } from '../shared/components/chat/chat.component';
import { OvSettingsModel } from '../shared/models/ovSettings';
import { ScreenType, VideoType } from '../shared/types/video-type';
import { ILogger } from '../shared/types/logger-type';
import { LayoutType } from '../shared/types/layout-type';
import { Theme } from '../shared/types/webcomponent-config';
import { ExternalConfigModel } from '../shared/models/external-config';
import { Storage } from '../shared/types/storage-type';

// Services
import { DevicesService } from '../shared/services/devices/devices.service';
import { LoggerService } from '../shared/services/logger/logger.service';
import { RemoteUsersService } from '../shared/services/remote-users/remote-users.service';
import { UtilsService } from '../shared/services/utils/utils.service';
import { MatSidenav } from '@angular/material/sidenav';
import { ChatService } from '../shared/services/chat/chat.service';
import { UserName } from '../shared/types/username-type';
import { StorageService } from '../shared/services/storage/storage.service';
import { OpenViduLayoutService } from '../shared/services/layout/layout.service';
import { TokenService } from '../shared/services/token/token.service';
import { LocalUsersService } from '../shared/services/local-users/local-users.service';
import { OpenViduWebrtcService } from '../shared/services/openvidu-webrtc/openvidu-webrtc.service';
import { LayoutClass } from '../shared/types/layout-type';

@Component({
	selector: 'app-video-room',
	templateUrl: './video-room.component.html',
	styleUrls: ['./video-room.component.css']
})
export class VideoRoomComponent implements OnInit, OnDestroy {
	// Config from webcomponent or angular-library
	@Input() externalConfig: ExternalConfigModel;
	@Output() _session = new EventEmitter<any>();
	@Output() _publisher = new EventEmitter<any>();
	@Output() _error = new EventEmitter<any>();

	// !Deprecated
	@Output() _joinSession = new EventEmitter<any>();
	// !Deprecated
	@Output() _leaveSession = new EventEmitter<any>();

	@ViewChild('chatComponent') chatComponent: ChatComponent;
	@ViewChild('sidenav') chatSidenav: MatSidenav;

	ovSettings: OvSettingsModel;
	compact = false;
	sidenavMode: 'side' | 'over' = 'side';
	lightTheme: boolean;
	showConfigRoomCard = true;
	session: Session;
	sessionScreen: Session;
	localUsers: UserModel[] = [];
	remoteUsers: UserModel[] = [];
	participantsNameList: UserName[] = [];
	isConnectionLost: boolean;
	isAutoLayout = false;
	hasVideoDevices: boolean;
	hasAudioDevices: boolean;
	private log: ILogger;
	private oVUsersSubscription: Subscription;
	private remoteUsersSubscription: Subscription;
	private chatSubscription: Subscription;
	private remoteUserNameSubscription: Subscription;

	constructor(
		private router: Router,
		private utilsSrv: UtilsService,
		private remoteUsersService: RemoteUsersService,
		private openViduWebRTCService: OpenViduWebrtcService,
		private localUsersService: LocalUsersService,
		private oVDevicesService: DevicesService,
		private loggerSrv: LoggerService,
		private chatService: ChatService,
		private storageSrv: StorageService,
		private oVLayout: OpenViduLayoutService,
		private tokenService: TokenService
	) {
		this.log = this.loggerSrv.get('VideoRoomComponent');
	}

	@HostListener('window:beforeunload')
	beforeunloadHandler() {
		this.leaveSession();
	}

	@HostListener('window:resize')
	sizeChange() {
		this.oVLayout.update();
		this.checkSizeComponent();
	}

	@HostListener('document:keyup', ['$event'])
	handleKeyboardEvent(event: KeyboardEvent) {
	  //console.log(event);
	  let x = event.keyCode;
	  if ( !(<HTMLElement>event.target).id.includes("chatInput")){
		  if (x == 32) {
			  this.toggleMic();
		  }
		  else if (x == 86) {
			  this.toggleCam();
		  }
	  }
	}

	async ngOnInit() {
		this.localUsersService.initialize();
		this.openViduWebRTCService.initialize();

		this.lightTheme = this.externalConfig?.getTheme() === Theme.LIGHT;
		this.ovSettings = !!this.externalConfig ? this.externalConfig.getOvSettings() : new OvSettingsModel();
		this.ovSettings.setScreenSharing(this.ovSettings.hasScreenSharing() && !this.utilsSrv.isMobile());
	}

	ngOnDestroy() {
		// Reconnecting session is received in Firefox
		// To avoid 'Connection lost' message uses session.off()
		this.session?.off('reconnecting');
		this.remoteUsersService.clear();
		this.oVLayout.clear();
		this.localUsersService.clear();
		this.session = null;
		this.sessionScreen = null;
		this.localUsers = [];
		this.remoteUsers = [];
		if (this.oVUsersSubscription) {
			this.oVUsersSubscription.unsubscribe();
		}
		if (this.remoteUsersSubscription) {
			this.remoteUsersSubscription.unsubscribe();
		}
		if (this.chatSubscription) {
			this.chatSubscription.unsubscribe();
		}
		if (this.remoteUserNameSubscription) {
			this.remoteUserNameSubscription.unsubscribe();
		}
	}

	onConfigRoomJoin() {
		this.hasVideoDevices = this.oVDevicesService.hasVideoDeviceAvailable();
		this.hasAudioDevices = this.oVDevicesService.hasAudioDeviceAvailable();
		this.showConfigRoomCard = false;
		this.subscribeToLocalUsers();
		this.subscribeToRemoteUsers();
		this.tokenService.initialize(this.ovSettings);

		setTimeout(() => {
			this.oVLayout.initialize();
			this.checkSizeComponent();
			this.joinToSession();
		}, 50);
	}

	async joinToSession() {
		this.openViduWebRTCService.initSessions();
		this.session = this.openViduWebRTCService.getWebcamSession();
		this._session.emit(this.session);
		this.sessionScreen = this.openViduWebRTCService.getScreenSession();
		this.subscribeToConnectionCreatedAndDestroyed();
		this.subscribeToStreamCreated();
		this.subscribeToStreamDestroyed();
		this.subscribeToStreamPropertyChange();
		this.subscribeToNicknameChanged();
		this.chatService.setChatComponent(this.chatSidenav);
    if (this.isFunctionUser()){
    	this.chatService.setcmdMode();
    }
		this.chatService.subscribeToChat();
		this.subscribeToChatComponent();
		this.subscribeToReconnection();
		await this.connectToSession();
		// Workaround, firefox does not have audio when publisher join with muted camera
		if (this.utilsSrv.isFirefox() && !this.localUsersService.hasWebcamVideoActive()) {
			this.openViduWebRTCService.publishWebcamVideo(true);
			this.openViduWebRTCService.publishWebcamVideo(false);
		}
    this.subscribeToSpeechhl();
	}

	leaveSession() {
		this.log.d('Leaving session...');
		this.openViduWebRTCService.disconnect();
		this.router.navigate(['']);
		this._leaveSession.emit();
	}

	onNicknameUpdate(nickname: string) {
		this.localUsersService.updateUsersNickname(nickname);
		this.storageSrv.set(Storage.USER_NICKNAME, nickname);
		this.openViduWebRTCService.sendNicknameSignal();
	}

	toggleMic() {
		if (this.localUsersService.isWebCamEnabled()) {
			this.openViduWebRTCService.publishWebcamAudio(!this.localUsersService.hasWebcamAudioActive());
			return;
		}
		this.openViduWebRTCService.publishScreenAudio(!this.localUsersService.hasScreenAudioActive());
	}

	async offCam() {
		// Disabling webcam
		if (this.localUsersService.areBothConnected()) {
			this.openViduWebRTCService.publishWebcamVideo(false);
			this.localUsersService.disableWebcamUser();
			this.openViduWebRTCService.unpublishWebcamPublisher();
			return;
		}
    if (this.localUsersService.hasWebcamVideoActive()){
		  this.openViduWebRTCService.publishWebcamVideo(false);
    }
    this.oVLayout.update();
	}



	async toggleCam() {
		const publishVideo = !this.localUsersService.hasWebcamVideoActive();

		// Disabling webcam
		if (this.localUsersService.areBothConnected()) {
			this.openViduWebRTCService.publishWebcamVideo(publishVideo);
			this.localUsersService.disableWebcamUser();
			this.openViduWebRTCService.unpublishWebcamPublisher();
      		this.oVLayout.update();
			return;
		}
		// Enabling webcam
		if (this.localUsersService.isOnlyScreenConnected()) {
			const hasAudio = this.localUsersService.hasScreenAudioActive();

			if (!this.openViduWebRTCService.isWebcamSessionConnected()) {
				await this.connectWebcamSession();
			}
			await this.openViduWebRTCService.publishWebcamPublisher();
			this.openViduWebRTCService.publishScreenAudio(false);
			this.openViduWebRTCService.publishWebcamAudio(hasAudio);
			this.localUsersService.enableWebcamUser();
		}
		// Muting/unmuting webcam
		this.openViduWebRTCService.publishWebcamVideo(publishVideo);
    	this.oVLayout.update();
	}

	async toggleScreenShare() {
		// Disabling screenShare
		if (this.localUsersService.areBothConnected()) {
			this.removeScreen();
			return;
		}

		// Enabling screenShare
		if (this.localUsersService.isOnlyWebcamConnected()) {
			const screenPublisher = this.initScreenPublisher();

			screenPublisher.once('accessAllowed', async (event) => {
				// Listen to event fired when native stop button is clicked
				screenPublisher.stream
					.getMediaStream()
					.getVideoTracks()[0]
					.addEventListener('ended', () => {
						this.log.d('Clicked native stop button. Stopping screen sharing');
						this.toggleScreenShare();
					});
				this.log.d('ACCESS ALOWED screenPublisher');
				this.localUsersService.enableScreenUser(screenPublisher);

				if (!this.openViduWebRTCService.isScreenSessionConnected()) {
					await this.connectScreenSession();
				}
				await this.openViduWebRTCService.publishScreenPublisher();
				this.openViduWebRTCService.sendNicknameSignal();
				if (!this.localUsersService.hasWebcamVideoActive()) {
					// Disabling webcam
					this.localUsersService.disableWebcamUser();
					this.openViduWebRTCService.unpublishWebcamPublisher();
				}
			});

			screenPublisher.once('accessDenied', (event) => {
				this.log.w('ScreenShare: Access Denied');
			});
			return;
		}

		// Disabling screnShare and enabling webcam
		const hasAudio = this.localUsersService.hasScreenAudioActive();
		await this.openViduWebRTCService.publishWebcamPublisher();
		this.openViduWebRTCService.publishScreenAudio(false);
		this.openViduWebRTCService.publishWebcamAudio(hasAudio);
		this.localUsersService.enableWebcamUser();
		this.removeScreen();
	}

	toggleSpeakerLayout() {
		if (!this.localUsersService.isScreenShareEnabled()) {
			this.isAutoLayout = !this.isAutoLayout;

			this.log.d('Automatic Layout ', this.isAutoLayout ? 'Disabled' : 'Enabled');
			if (this.isAutoLayout) {
				this.subscribeToSpeechDetection();
				return;
			}
			this.log.d('Unsubscribe to speech detection');
			this.session.off('publisherStartSpeaking');
			this.resetAllBigElements();
			this.oVLayout.update();
			return;
		}
		this.log.w('Screen is enabled. Speech detection has been rejected');
	}

	onReplaceScreenTrack(event) {
		this.openViduWebRTCService.replaceScreenTrack();
	}

	checkSizeComponent() {
		this.compact = document.getElementById('room-container')?.offsetWidth <= 790;
		this.sidenavMode = this.compact ? 'over' : 'side';
	}

	onKickClicked(event: {element: HTMLElement; connectionId?: string}){
		if (this.isFunctionUser()){
			this.session.signal({
							   data: event.connectionId,
							   type: 'kick'
					   });
	    let remoteModel: UserModel = this.remoteUsersService.getRemoteUserByConnectionId(event.connectionId);
			let msg:string = remoteModel.getNickname() + " banned by " + this.localUsersService.getWebcamUserName();
			this.chatService.sendMessage(msg);
		}
  }

   onTogmicClicked(event: {element: HTMLElement; connectionId?: string}){
		   this.session.signal({
						   data: event.connectionId,
						   type: 'togmic'
				   });
    }
   onTogcamClicked(event: {element: HTMLElement; connectionId?: string}){
		   this.session.signal({
						   data: event.connectionId,
						   type: 'togcam'
				   });
    }

	onToggleVideoSize(event: { element: HTMLElement; connectionId?: string; resetAll?: boolean }) {
		console.log("onToggleVideoSize");
		console.log(event);
		if ( this.isFunctionUser() ){
			var chkCurrentzoomtrue = false;
			if (!!event?.connectionId) {
				if (this.openViduWebRTCService.isMyOwnConnection(event.connectionId)) {
					chkCurrentzoomtrue = this.localUsersService.isVideoSizeBig(event.connectionId);
				} else {
					chkCurrentzoomtrue = this.remoteUsersService.getRemoteUserByConnectionId(event.connectionId).isVideoSizeBig();
				}
			}
			const data = {
				elementid : event.element.getElementsByClassName("OT_widget-container")[0].id,
				elemntisBig : event.element?.className.includes(LayoutClass.BIG_ELEMENT) ,
				connectionId : event.connectionId,
				resetAll : event.resetAll,
				zoomTrue : !!chkCurrentzoomtrue
			}
			this.session.signal({
							data: JSON.stringify(data),
							type: 'togzoom'
			});
		}
		else{
			const element = event.element;
			if (!!event.resetAll) {
				this.resetAllBigElements();
			}

			this.utilsSrv.toggleBigElementClass(element);

			// Has been mandatory change the user zoom property here because of
			// zoom icons and cannot handle publisherStartSpeaking event in other component
			if (!!event?.connectionId) {
				if (this.openViduWebRTCService.isMyOwnConnection(event.connectionId)) {
					this.localUsersService.toggleZoom(event.connectionId);
				} else {
					this.remoteUsersService.toggleUserZoom(event.connectionId);
				}
			}
			// added
			this.oVLayout.update();
		}
	}



	isFunctionUser(): boolean {
		if (this.localUsersService.getWebcamUserName().includes('모니터')){
    	return true;
    }
		else if (this.localUsersService.getWebcamUserName().includes('자료')){
    	return true;
    }
		return false;

	}

	toolbarMicIconEnabled(): boolean {
		if (this.localUsersService.isWebCamEnabled()) {
			return this.localUsersService.hasWebcamAudioActive();
		}
		return this.localUsersService.hasScreenAudioActive();
	}

	private async connectToSession(): Promise<void> {
		try {
			// Initialize tokens from externalConfig or create new ones
			await this.tokenService.initTokens(this.externalConfig);
		} catch (error) {
			this.log.e('There was an error initializing the token:', error.status, error.message);
			this._error.emit({ error: error.error, messgae: error.message, code: error.code, status: error.status });
			this.utilsSrv.showErrorMessage('There was an error initializing the token:', error.error || error.message);
		}

		if (this.localUsersService.areBothConnected()) {
			await this.connectWebcamSession();
			await this.connectScreenSession();
			await this.openViduWebRTCService.publishWebcamPublisher();
			await this.openViduWebRTCService.publishScreenPublisher();
		} else if (this.localUsersService.isOnlyScreenConnected()) {
			await this.connectScreenSession();
			await this.openViduWebRTCService.publishScreenPublisher();
		} else {
			await this.connectWebcamSession();
			await this.openViduWebRTCService.publishWebcamPublisher();
		}
		// !Deprecated
		this._joinSession.emit();

		this.oVLayout.update();
	}

	private async connectScreenSession() {
		try {
			await this.openViduWebRTCService.connectScreenSession(this.tokenService.getScreenToken());
		} catch (error) {
			this._error.emit({ error: error.error, messgae: error.message, code: error.code, status: error.status });
			this.log.e('There was an error connecting to the session:', error.code, error.message);
			this.utilsSrv.showErrorMessage('There was an error connecting to the session:', error?.error || error?.message);
		}
	}

	private async connectWebcamSession() {
		try {
			await this.openViduWebRTCService.connectWebcamSession(this.tokenService.getWebcamToken());
		} catch (error) {
			this._error.emit({ error: error.error, messgae: error.message, code: error.code, status: error.status });
			this.log.e('There was an error connecting to the session:', error.code, error.message);
			this.utilsSrv.showErrorMessage('There was an error connecting to the session:', error?.error || error?.message);
		}
	}

	private subscribeToConnectionCreatedAndDestroyed() {
		this.session.on('connectionCreated', (event: ConnectionEvent) => {
			if (this.openViduWebRTCService.isMyOwnConnection(event.connection.connectionId)) {
				return;
			}

			const nickname: string = this.utilsSrv.getNicknameFromConnectionData(event.connection.data);
			this.remoteUsersService.addUserName(event);

			// Adding participant when connection is created
			if (!nickname?.includes('_' + VideoType.SCREEN)) {
				this.remoteUsersService.add(event, null);
				this.openViduWebRTCService.sendNicknameSignal(event.connection);
			}
		});

		this.session.on('connectionDestroyed', (event: ConnectionEvent) => {
			if (this.openViduWebRTCService.isMyOwnConnection(event.connection.connectionId)) {
				return;
			}
			this.remoteUsersService.deleteUserName(event);
			const nickname: string = this.utilsSrv.getNicknameFromConnectionData(event.connection.data);
			// Deleting participant when connection is destroyed
			if (!nickname?.includes('_' + VideoType.SCREEN)) {
				this.remoteUsersService.removeUserByConnectionId(event.connection.connectionId);
			}
		});
	}

	private subscribeToStreamCreated() {
		this.session.on('streamCreated', (event: StreamEvent) => {
			const connectionId = event.stream.connection.connectionId;

			if (this.openViduWebRTCService.isMyOwnConnection(connectionId)) {
				return;
			}

			const subscriber: Subscriber = this.session.subscribe(event.stream, undefined);
			this.remoteUsersService.add(event, subscriber);
			// this.oVSessionService.sendNicknameSignal(event.stream.connection);
		});
	}

	private subscribeToStreamDestroyed() {
		this.session.on('streamDestroyed', (event: StreamEvent) => {
			const connectionId = event.stream.connection.connectionId;
			this.remoteUsersService.removeUserByConnectionId(connectionId);
			// event.preventDefault();
		});
	}

	// Emit publisher to webcomponent
	emitPublisher(publisher: Publisher) {
		this._publisher.emit(publisher);
	}

	private subscribeToStreamPropertyChange() {
		this.session.on('streamPropertyChanged', (event: StreamPropertyChangedEvent) => {
			const connectionId = event.stream.connection.connectionId;
			if (this.openViduWebRTCService.isMyOwnConnection(connectionId)) {
				return;
			}
			if (event.changedProperty === 'videoActive') {
				this.remoteUsersService.updateUsers();
			}
		});
	}

	private subscribeToNicknameChanged() {
		this.session.on('signal:nicknameChanged', (event: any) => {
			const connectionId = event.from.connectionId;
			if (this.openViduWebRTCService.isMyOwnConnection(connectionId)) {
				return;
			}
			const nickname = this.utilsSrv.getNicknameFromConnectionData(event.data);
			this.remoteUsersService.updateNickname(connectionId, nickname);
		});
	}

	private subscribeToSpeechDetection() {
		this.log.d('Subscribe to speech detection', this.session);
		// Has been mandatory change the user zoom property here because of
		// zoom icons and cannot handle publisherStartSpeaking event in other component
		this.session.on('publisherStartSpeaking', (event: PublisherSpeakingEvent) => {
			const someoneIsSharingScreen = this.remoteUsersService.someoneIsSharingScreen();
			if (!this.localUsersService.isScreenShareEnabled() && !someoneIsSharingScreen) {
				const elem = event.connection.stream.streamManager.videos[0].video;
				const element = this.utilsSrv.getHTMLElementByClassName(elem, LayoutType.ROOT_CLASS);
				this.resetAllBigElements();
				this.remoteUsersService.setUserZoom(event.connection.connectionId, true);
				this.onToggleVideoSize({ element });
			}
		});
	}

  private subscribeToSpeechhl() {
    this.log.d('Subscribe to speech highlight', this.session);
    // Has been mandatory change the user zoom property here because of
    // zoom icons and cannot handle publisherStartSpeaking event in other component
    this.session.on('publisherStartSpeaking', (event: PublisherSpeakingEvent) => {
      const someoneIsSharingScreen = this.remoteUsersService.someoneIsSharingScreen();
      if (!this.localUsersService.isScreenShareEnabled() && !someoneIsSharingScreen) {
        const elem = event.connection.stream.streamManager.videos[0].video;
        const element = this.utilsSrv.getHTMLElementByClassName(elem, LayoutType.ROOT_CLASS);
        this.resetAllHlElements();
        element.classList.add('OT_borderhl');
		
		event.connection.stream.streamManager.audioActive = true;
		
      }
    });
    this.session.on('publisherStopSpeaking', (event: PublisherSpeakingEvent) => {
      const someoneIsSharingScreen = this.remoteUsersService.someoneIsSharingScreen();
      if (!this.localUsersService.isScreenShareEnabled() && !someoneIsSharingScreen) {
        const elem = event.connection.stream.streamManager.videos[0].video;
        const element = this.utilsSrv.getHTMLElementByClassName(elem, LayoutType.ROOT_CLASS);
		    this.removehlElementClass(element);
      }
    });
  }

  removehlElementClass(element: HTMLElement | Element) {
    element?.classList.remove('OT_borderhl');
    element?.classList.add('OT_borderzero');
  }

  resetAllHlElements() {
    const elements: HTMLCollectionOf<Element> = document.getElementsByClassName('OT_borderhl');
    while (elements.length > 0) {
      this.removehlElementClass(elements[0]);
    }
  }

	private removeScreen() {
		this.localUsersService.disableScreenUser();
		this.openViduWebRTCService.unpublishScreenPublisher();
	}

	private subscribeToChatComponent() {
		this.chatSubscription = this.chatService.toggleChatObs.subscribe((opened) => {
			const timeout = this.externalConfig ? 300 : 0;
			this.oVLayout.update(timeout);
		});
	}

	private subscribeToReconnection() {
		this.session.on('reconnecting', () => {
			this.log.w('Connection lost: Reconnecting');
			this.isConnectionLost = true;
			this.utilsSrv.showErrorMessage('Connection Problem', 'Oops! Trying to reconnect to the session ...', true);
		});
		this.session.on('reconnected', () => {
			this.log.w('Connection lost: Reconnected');
			this.isConnectionLost = false;
			this.utilsSrv.closeDialog();
		});
		this.session.on('sessionDisconnected', (event: SessionDisconnectedEvent) => {
			if (event.reason === 'networkDisconnect') {
				this.utilsSrv.closeDialog();
				this.leaveSession();
			}
		});
		this.session.on('signal:kick', (event: any) =>  {
      const data = event.data;
      if (this.openViduWebRTCService.isMyOwnConnection(data)) {
              this.utilsSrv.closeDialog();
              this.leaveSession();
      }
    });
    this.session.on('signal:togmic', (event: any) =>  {
      const data = event.data;
      if (this.openViduWebRTCService.isMyOwnConnection(data)) {
              this.toggleMic();
      }
    });
    this.session.on('signal:togcam', (event: any) =>  {
      const data = event.data;
      if (this.openViduWebRTCService.isMyOwnConnection(data)) {
          this.offCam();
      }
    });
		this.session.on('signal:togzoom', (longevent: any) =>  {
			console.log("signal:togzoom");
			console.log(longevent);
			const event = JSON.parse(longevent.data);
			console.log(event);
			//parentElement 로 치환
			const element = document.getElementById(event.elementid).parentElement.parentElement;
			if (!!event.resetAll) {
				this.resetAllBigElements();
			}

			if ( element?.className.includes(LayoutClass.BIG_ELEMENT) && event.elemntisBig ){
					this.utilsSrv.toggleBigElementClass(element);
			}
			else if ( !(element?.className.includes(LayoutClass.BIG_ELEMENT)) && !event.elemntisBig ){
					this.utilsSrv.toggleBigElementClass(element);
			}

			// Has been mandatory change the user zoom property here because of
			// zoom icons and cannot handle publisherStartSpeaking event in other component
			if (!!event?.connectionId) {
				if (this.openViduWebRTCService.isMyOwnConnection(event.connectionId)) {
					if ( !!this.localUsersService.isVideoSizeBig(event.connectionId) == event.zoomTrue ){
							this.localUsersService.toggleZoom(event.connectionId);
					}
				} else {
					this.remoteUsersService.setUserZoom(event.connectionId, !event.zoomTrue );
				}
			}
			this.oVLayout.update();
    });
    this.session.on('signal:cmd', (event: any) =>  {
      const connectionId = event.from.connectionId;
      const data = JSON.parse(event.data);
      const isMyOwnConnection = this.openViduWebRTCService.isMyOwnConnection(connectionId);
		  if (data.message.indexOf('~') == 0){
				let needcmd =["",""];
				if( data.message.includes('\"')){
					let tmpneedcmd = data.message.split(/"/);
					needcmd[0] = tmpneedcmd[1];
					needcmd[1] = tmpneedcmd[3];
				}
				else if( data.message.includes("\'")){
					let tmpneedcmd = data.message.split(/'/);
					needcmd[0] = tmpneedcmd[1];
					needcmd[1] = tmpneedcmd[3];
				}
				else{
					let tmpneedcmd = data.message.split(/ /);
					needcmd[0] = tmpneedcmd[1];
					needcmd[1] = tmpneedcmd[2];
				}

				if (data.message.indexOf('~rename ') == 0){
					if ( needcmd[0] == this.localUsersService.getWebcamUserName() ){
					  this.onNicknameUpdate(needcmd[1]);
					}
				}
				if (data.message.indexOf('~offcam ') == 0){
					if ( needcmd[0] == this.localUsersService.getWebcamUserName() ){
					  this.offCam();
					}
				}
				if (data.message.indexOf('~togglecam ') == 0){
					if ( needcmd[0] == this.localUsersService.getWebcamUserName() ){
					  this.toggleCam(); 
					}
				}
				if (data.message.indexOf('~reconnect ') == 0){
					if ( needcmd[0] == this.localUsersService.getWebcamUserName() ){
						if (needcmd[1] === 'fast'){
							this.storageSrv.set("fastReconnect","Y");
						}
						window.location.reload();
					}
				}
		  }
    });
  }

	private initScreenPublisher(): Publisher {
		const videoSource = ScreenType.SCREEN;
		const audioSource = this.hasAudioDevices ? undefined : null;
		const willThereBeWebcam = this.localUsersService.isWebCamEnabled() && this.localUsersService.hasWebcamVideoActive();
		const hasAudio = willThereBeWebcam ? false : this.hasAudioDevices && this.localUsersService.hasWebcamAudioActive();
		const properties = this.openViduWebRTCService.createPublisherProperties(videoSource, audioSource, true, hasAudio, false);

		try {
			return this.openViduWebRTCService.initPublisher(undefined, properties);
		} catch (error) {
			this.log.e(error);
			this.utilsSrv.handlerScreenShareError(error);
		}
	}

	private resetAllBigElements() {
		this.utilsSrv.removeAllBigElementClass();
		this.remoteUsersService.resetUsersZoom();
		this.localUsersService.resetUsersZoom();
	}

	private subscribeToLocalUsers() {
		this.oVUsersSubscription = this.localUsersService.OVUsers.subscribe((users: UserModel[]) => {
			this.localUsers = users;
			this.oVLayout.update();
		});
	}

	private subscribeToRemoteUsers() {
		this.remoteUsersSubscription = this.remoteUsersService.remoteUsers.subscribe((users: UserModel[]) => {
			this.remoteUsers = [...users];
			this.oVLayout.update();
		});

		this.remoteUserNameSubscription = this.remoteUsersService.remoteUserNameList.subscribe((names: UserName[]) => {
			this.participantsNameList = [...names];
		});
	}
}
