"use strict";

const DateTime = luxon.DateTime;

// Consts
const keyApiKey = `key`;
const keyUserId = `user`;
const fetchTotalsIntervalDelay = 5000;
const defaultTimeZone = `UTC`;
const apiHost = `https://cardiologger.otterbagel.com/v1`;

// Vars
let fetchingUpdate = false;
let user = null;
let userUpdateInterval = null;

// Functions
function apiCall(endpoint, method, data = {}) {
	const storedCreds = getStoredCredentials();
	if(!storedCreds.key) {
		logOut();
		throw Error(`No API key in local storage`);
	}

	return new Promise((resolve, reject) => {
		jQuery.ajax(`${apiHost}${endpoint}`, {
			data: data,
			headers: {
				"X-API-Key": storedCreds.key,
			},
			method: method,
			error: reject,
			success: (data) => {
				if(data && data.error) {
					reject(data.error);
					return;
				}
				resolve(data);
			},
		});
	});
}

async function updateUserTotals() {
	if(fetchingUpdate || !loggedIn()) return;
	fetchingUpdate = true;

	try {
		const isConnected = (await apiCall(`/connected/${user.id}`, `GET`)).connected;
		handleConnectionUpdated(isConnected);

		const now = DateTime.now().setZone(user.timezone || defaultTimeZone);
		const dayTotals = await apiCall(`/user-cardio-totals/${user.id}`, `GET`, { year: now.year, week: now.weekNumber, day: now.weekday });
		const weekTotals = await apiCall(`/user-cardio-totals/${user.id}`, `GET`, { year: now.year, week: now.weekNumber });
		handleCumulativeTotalsUpdate(now, dayTotals, weekTotals);
	} finally {
		fetchingUpdate = false;
	}
}

function handleConnectionUpdated(isConnected) {
	$(`#disconnected`).hide();
	$(`#connected`).hide();

	if(isConnected) {
		$(`#connected`).show();
	} else {
		$(`#disconnected`).show();
	}
}

function handleCumulativeTotalsUpdate(now, dayTotals, weekTotals) {
	$(`#daily-totals .points`).text(Math.floor(dayTotals.points));
	$(`#daily-totals .active-time`).text(Math.floor(dayTotals.active_seconds / 60.0));

	$(`#weekly-totals .points`).text(Math.floor(weekTotals.points));
	$(`#weekly-totals .active-time`).text(Math.floor(weekTotals.active_seconds / 60.0));
}

async function connect() {
	await apiCall(`/connect/${user.id}`, `POST`);
	updateUserTotals().catch(console.error);
}

function getStoredCredentials() {
	return {
		key: window.localStorage.getItem(keyApiKey) || null,
		user: window.localStorage.getItem(keyUserId) || null,
	};
}

function logOut() {
	window.localStorage.clear();
	user = null;
	if(userUpdateInterval) {
		clearInterval(userUpdateInterval);
		userUpdateInterval = null;
	}
	fetchingUpdate = false;
	refreshLoggedInState();
}

function handleLoggedIn() {
	refreshLoggedInState();

	if(userUpdateInterval) {
		clearInterval(userUpdateInterval);
	}
	userUpdateInterval = setInterval(() => updateUserTotals().catch(console.error), fetchTotalsIntervalDelay);

	updateUserTotals().catch(console.error);
}

function refreshLoggedInState() {
	setLoggingInUI(false);

	if(loggedIn()) {
		$(`#login`).hide();
		$(`#authenticated`).show();
		return;
	}

	$(`#login`).show();
	$(`#authenticated`).hide();
}

function loggedIn() {
	return user && user.id;
}

function setLoggingInUI(loggingIn) {
	if(loggingIn) {
		$(`#login-form`).hide();
		$(`#logging-in`).show();
		return;
	}

	$(`#login-form`).show();
	$(`#logging-in`).hide();
}

async function attemptFetchUser() {
	const storedCreds = getStoredCredentials();
	if(!storedCreds.key || !storedCreds.user) {
		logOut();
		return;
	}

	try {
		setLoggingInUI(true);
		user = await apiCall(`/users/${storedCreds.user}`, `GET`);
		if(loggedIn()) {
			handleLoggedIn();
			return;
		}
	} catch (err) {
		console.error(err);
	}

	logOut();
}

function handleLoginFormSubmit(formData) {
	window.localStorage.setItem(keyApiKey, formData.key);
	window.localStorage.setItem(keyUserId, formData.user);
	attemptFetchUser().catch(console.error);
}

function arrayToDict(array, key, value) {
	return Object.fromEntries(array.filter(x => x[key]).map(x => [ x[key], x[value] ]));
}

function setUpFormSubmissionHandler($form, processForm) {
	$form.submit(event => {
		processForm(arrayToDict(Object.values(event.target), `name`, `value`));
		return false;
	});
}

async function docLoaded() {
	$(`#connect-button`).click(() => connect().catch(console.error));
	$(`#logout-button`).click(logOut);
	setUpFormSubmissionHandler($(`#login-form`), handleLoginFormSubmit);
	await attemptFetchUser();
}

$(document).ready(() => docLoaded().catch(console.error));
