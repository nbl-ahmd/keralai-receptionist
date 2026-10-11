export class AlphaAccessError extends Error {
 constructor(status,message){super(message);this.name='AlphaAccessError';this.status=status;}
}
