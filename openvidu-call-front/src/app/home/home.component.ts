import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { uniqueNamesGenerator, adjectives, colors, animals, NumberDictionary } from 'unique-names-generator';

@Component({
	selector: 'app-home',
	templateUrl: './home.component.html',
	styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
	public roomForm: FormControl;
	public version = require('../../../package.json').version;

	constructor(private router: Router, public formBuilder: FormBuilder) {}

	ngOnInit() {
    const numberDictionary = NumberDictionary.generate({ min: 100, max: 999 });
		const randomName = uniqueNamesGenerator({ dictionaries: [adjectives, colors, animals, numberDictionary], separator: '-', });
		this.roomForm = new FormControl(randomName, [Validators.minLength(4), Validators.required]);
	}

	public goToVideoCall() {
		if (this.roomForm.valid) {
			const roomName = this.roomForm.value.replace(/ /g, '-'); // replace white spaces by -
			this.roomForm.setValue(roomName);
			this.router.navigate(['/', roomName]);
		}
	}
}
